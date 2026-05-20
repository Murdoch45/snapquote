import "server-only";
import * as Sentry from "@sentry/nextjs";
import { buildReferralProgramEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 2026-05-20 — referral-program email send-timing orchestration.
 *
 * Goal: max two referral emails per org, ever. Two trigger events:
 *   Event A — the org receives its FIRST lead
 *   Event B — the org's FIRST paid-plan conversion (Stripe invoice paid /
 *             RC INITIAL_PURCHASE non-trial)
 *
 * Rules:
 *   - Whichever event happens first fires email #1.
 *   - The OTHER event fires email #2, subject to a 3-week minimum gap
 *     from email #1.
 *   - If Event B fires before the 3-week floor, email #2 is queued via
 *     organizations.referral_email_second_due_at and a daily cron picks
 *     it up at or after that timestamp.
 *   - If an org only ever fires one of the two events, it just gets
 *     email #1. That's fine — the contract is "at most two."
 *
 * Idempotency: every send is gated behind an UPDATE-WHERE-NULL atomic
 * claim on the relevant timestamp column. Same event firing twice cannot
 * double-send. Send-failure paths roll back the claim so the next trigger
 * (or cron tick) can retry.
 *
 * State columns added in migration 20260520_referral_email_sends_columns:
 *   organizations.referral_email_first_sent_at   timestamptz NULL
 *   organizations.referral_email_second_sent_at  timestamptz NULL
 *   organizations.referral_email_second_due_at   timestamptz NULL
 */

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

type OrgEmailState = {
  referral_email_first_sent_at: string | null;
  referral_email_second_sent_at: string | null;
  referral_email_second_due_at: string | null;
};

type TriggerSource =
  | "first_lead" // Event A
  | "stripe_invoice_paid" // Event B (web Stripe)
  | "rc_initial_purchase" // Event B (mobile RC IAP)
  | "cron_followup"; // daily cron releasing a queued email #2

async function loadOrgEmailState(
  admin: AdminClient,
  orgId: string
): Promise<OrgEmailState | null> {
  const { data, error } = await admin
    .from("organizations")
    .select(
      "referral_email_first_sent_at, referral_email_second_sent_at, referral_email_second_due_at"
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as OrgEmailState | null) ?? null;
}

async function sendReferralEmail(
  admin: AdminClient,
  orgId: string,
  source: TriggerSource
): Promise<boolean> {
  const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
  if (!ownerEmail) {
    Sentry.captureMessage("Referral email skipped: no owner email", {
      level: "info",
      tags: { area: "referral-emails", stage: "send", source },
      extra: { orgId }
    });
    return false;
  }
  const email = buildReferralProgramEmail();
  const sent = await sendEmail({
    to: ownerEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
    sender: "noreply",
    // Resend-side dedupe keyed per (org, slot). Belt + suspenders against
    // a double-trigger that somehow slips past the DB claim.
    idempotencyKey: `referral-email:${orgId}:${source === "cron_followup" ? "second" : "first-or-second"}`
  });
  if (!sent) {
    Sentry.captureMessage("Referral email send failed", {
      level: "warning",
      tags: { area: "referral-emails", stage: "send", source },
      extra: { orgId, ownerEmail }
    });
  }
  return sent;
}

async function claimAndSendFirst(
  admin: AdminClient,
  orgId: string,
  source: TriggerSource
): Promise<void> {
  const now = new Date().toISOString();
  // Atomic claim — only one writer wins.
  const { data: claimed, error: claimError } = await admin
    .from("organizations")
    .update({ referral_email_first_sent_at: now })
    .eq("id", orgId)
    .is("referral_email_first_sent_at", null)
    .is("referral_email_second_sent_at", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return; // race lost — clean no-op

  const sent = await sendReferralEmail(admin, orgId, source);
  if (!sent) {
    // Roll back so the next trigger retries.
    await admin
      .from("organizations")
      .update({ referral_email_first_sent_at: null })
      .eq("id", orgId);
  }
}

async function claimAndSendSecondImmediate(
  admin: AdminClient,
  orgId: string,
  source: TriggerSource
): Promise<void> {
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("organizations")
    .update({
      referral_email_second_sent_at: now,
      referral_email_second_due_at: null
    })
    .eq("id", orgId)
    .is("referral_email_second_sent_at", null)
    .not("referral_email_first_sent_at", "is", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return;

  const sent = await sendReferralEmail(admin, orgId, source);
  if (!sent) {
    // Roll back so cron / next trigger retries. due_at restoration uses
    // first_sent + 21d as the deadline (recompute, since it might have
    // been cleared above).
    const { data: firstRow } = await admin
      .from("organizations")
      .select("referral_email_first_sent_at")
      .eq("id", orgId)
      .maybeSingle();
    const firstIso = firstRow?.referral_email_first_sent_at as string | undefined;
    const dueAt = firstIso
      ? new Date(new Date(firstIso).getTime() + THREE_WEEKS_MS).toISOString()
      : new Date().toISOString();
    await admin
      .from("organizations")
      .update({
        referral_email_second_sent_at: null,
        referral_email_second_due_at: dueAt
      })
      .eq("id", orgId);
  }
}

async function queueSecondForCron(
  admin: AdminClient,
  orgId: string,
  earliestSecondIso: string
): Promise<void> {
  // Only set due_at if not already set (don't overwrite an earlier
  // deferral marker — that would push the send out further).
  const { error } = await admin
    .from("organizations")
    .update({ referral_email_second_due_at: earliestSecondIso })
    .eq("id", orgId)
    .is("referral_email_second_sent_at", null)
    .is("referral_email_second_due_at", null)
    .not("referral_email_first_sent_at", "is", null);
  if (error) throw error;
}

/**
 * Trigger entry point — called from both Event A (first-lead) and Event B
 * (first paid-plan conversion). Decides whether to send email_1, send
 * email_2 immediately, queue email_2 for cron, or no-op.
 *
 * Always async-fire-and-forget from the caller's perspective: this
 * function never throws to the caller. Failures are Sentry-tagged.
 */
export async function tryFireReferralEmail(
  orgId: string,
  source: Exclude<TriggerSource, "cron_followup">
): Promise<void> {
  try {
    const admin = createAdminClient();
    const state = await loadOrgEmailState(admin, orgId);
    if (!state) return;
    if (state.referral_email_second_sent_at) return; // both sent

    const firstIso = state.referral_email_first_sent_at;
    if (!firstIso) {
      // No referral email sent yet — this trigger fires email #1.
      await claimAndSendFirst(admin, orgId, source);
      return;
    }

    // Email #1 was already sent; this trigger handles email #2.
    const earliestSecond = new Date(new Date(firstIso).getTime() + THREE_WEEKS_MS);
    if (new Date() >= earliestSecond) {
      await claimAndSendSecondImmediate(admin, orgId, source);
    } else {
      await queueSecondForCron(admin, orgId, earliestSecond.toISOString());
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: "referral-emails", stage: "try-fire", source },
      extra: { orgId }
    });
  }
}

/**
 * Cron processor — finds orgs where the second email is queued and the
 * 3-week floor has elapsed. Sends each, atomically. Caller is the daily
 * cron route /api/cron/referral-email-followup.
 */
export async function processReferralEmailFollowups(): Promise<{
  processed: number;
  sent: number;
}> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id")
    .not("referral_email_second_due_at", "is", null)
    .lte("referral_email_second_due_at", now)
    .is("referral_email_second_sent_at", null)
    .limit(100);
  if (error) {
    Sentry.captureException(error, {
      tags: { area: "referral-emails", stage: "cron-query" }
    });
    return { processed: 0, sent: 0 };
  }

  const processed = orgs?.length ?? 0;
  let sent = 0;
  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    try {
      const before = await loadOrgEmailState(admin, orgId);
      await claimAndSendSecondImmediate(admin, orgId, "cron_followup");
      const after = await loadOrgEmailState(admin, orgId);
      if (
        after?.referral_email_second_sent_at &&
        !before?.referral_email_second_sent_at
      ) {
        sent += 1;
      }
    } catch (orgError) {
      Sentry.captureException(orgError, {
        tags: { area: "referral-emails", stage: "cron-loop" },
        extra: { orgId }
      });
    }
  }
  return { processed, sent };
}
