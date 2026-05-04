import { NextResponse } from "next/server";
import { triggerEstimatorForLead } from "@/lib/ai/triggerEstimator";
import { sendNewLeadNotifications } from "@/lib/ai/estimate";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Leads stuck in "processing" past this horizon get acted on. Kept well
// above the estimator's own ~55s timeout so a lead that is legitimately
// still running doesn't get thrashed by a retry.
const STUCK_THRESHOLD_MINUTES = 5;

// After this many total minutes of "processing", we give up on retrying
// and mark the lead failed so the contractor still gets a notification.
// Picked to allow ~2 retry windows (each ~3 minutes via the Supabase
// pg_cron job "rescue-stuck-leads") before giving up.
const GIVE_UP_MINUTES = 15;

// Stage 3 (failed-lead retry) recency window. Anything older than this
// won't be retried — at that point the contractor has either acted on
// the manual estimate or moved on, and re-running AI silently against an
// already-shown card is more confusing than helpful.
const FAILED_RETRY_WINDOW_HOURS = 6;

// Hard cap on cross-cron retries per lead. ai_retry_count is incremented
// each time the rescue cron flips a "failed" lead back to "processing"
// for another shot. Two retries balances "give the AI another chance
// when latency is transient" against "don't loop forever on a
// permanently-broken request."
const MAX_AI_RETRIES = 2;

const STUCK_NOTE =
  "Estimator timed out before completing. The lead was auto-marked as failed so the contractor still gets notified.";

/**
 * Rescues leads in two flavours of broken state:
 *   - ai_status="processing" past the normal completion window
 *   - ai_status="failed" within the recent retry window AND under
 *     ai_retry_count cap
 *
 * Scheduled from Supabase, not Vercel. A pg_cron job named
 * "rescue-stuck-leads" fires every 3 minutes and hits this endpoint with
 * Authorization: Bearer ${CRON_SECRET}. Vercel Hobby only permits daily
 * crons so scheduling here was not an option; pg_cron + pg_net provides
 * the sub-hour cadence we need without upgrading plans.
 *
 * Three stages, run in this order so a single lead can't be pulled into
 * more than one bucket on the same tick:
 *   1. give-up: leads "processing" past GIVE_UP_MINUTES → flip to
 *      "failed" and fire the full notification chain (push, in-app,
 *      contractor email) so the contractor isn't ghosted on a total
 *      estimator outage.
 *   2. processing-retry: leads "processing" between
 *      STUCK_THRESHOLD_MINUTES and GIVE_UP_MINUTES → re-trigger the
 *      estimator. Row stays "processing".
 *   3. failed-retry: leads "failed" within the recency window with
 *      ai_retry_count < MAX_AI_RETRIES → flip back to "processing",
 *      increment ai_retry_count, and re-trigger the estimator.
 *
 * Each UPDATE filters on ai_status as a CAS so concurrent cron runs
 * don't double-notify or double-trigger.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const retryCutoff = new Date(
    Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000
  ).toISOString();
  const giveUpCutoff = new Date(Date.now() - GIVE_UP_MINUTES * 60 * 1000).toISOString();
  const failedRetryWindowStart = new Date(
    Date.now() - FAILED_RETRY_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Stage 1: mark long-stuck leads failed and notify. Done before the
  // other stages so the same lead can't be pulled into both buckets on
  // the same run.
  const { data: giveUpLeads, error: giveUpError } = await admin
    .from("leads")
    .update({
      ai_status: "failed",
      ai_estimator_notes: STUCK_NOTE
    })
    .eq("ai_status", "processing")
    .lt("submitted_at", giveUpCutoff)
    .select("id,org_id,address_full");

  if (giveUpError) {
    console.error("rescue-stuck-leads give-up update failed:", giveUpError);
    return NextResponse.json({ error: "Rescue failed" }, { status: 500 });
  }

  const givenUp = giveUpLeads ?? [];
  for (const lead of givenUp) {
    try {
      await sendNewLeadNotifications(admin, {
        leadId: lead.id as string,
        orgId: lead.org_id as string,
        addressFull: (lead.address_full as string | null) ?? null
      });
    } catch (notifyError) {
      console.error(
        "rescue-stuck-leads notification failed for lead",
        lead.id,
        notifyError
      );
    }
  }

  // Stage 2: re-trigger estimator for leads stuck between the retry
  // threshold and the give-up threshold.
  const { data: retryLeads, error: retryError } = await admin
    .from("leads")
    .select("id")
    .eq("ai_status", "processing")
    .lt("submitted_at", retryCutoff)
    .gte("submitted_at", giveUpCutoff);

  if (retryError) {
    console.error("rescue-stuck-leads retry lookup failed:", retryError);
    return NextResponse.json(
      { rescued: givenUp.length, retried: 0, error: "Retry lookup failed" },
      { status: 500 }
    );
  }

  const retries = retryLeads ?? [];
  let retriedCount = 0;
  for (const lead of retries) {
    const result = await triggerEstimatorForLead(lead.id as string);
    if (result.ok) {
      retriedCount++;
    } else {
      console.warn(
        "rescue-stuck-leads retry trigger failed for lead",
        lead.id,
        result.error
      );
    }
  }

  // Stage 3: retry recent failed leads under the per-lead retry cap. Read
  // the candidates first, then per-lead atomically transition
  // failed→processing while incrementing ai_retry_count. Doing the
  // transition per-lead (rather than as one bulk update) keeps the
  // ai_retry_count increment tied to the same row state we read, so two
  // concurrent cron ticks won't both try to retry the same lead — one
  // wins the CAS on ai_status and the other gets nothing.
  const { data: failedCandidates, error: failedLookupError } = await admin
    .from("leads")
    .select("id,org_id,ai_retry_count")
    .eq("ai_status", "failed")
    .lt("ai_retry_count", MAX_AI_RETRIES)
    .gte("submitted_at", failedRetryWindowStart);

  if (failedLookupError) {
    console.error("rescue-stuck-leads failed-retry lookup failed:", failedLookupError);
    return NextResponse.json(
      {
        rescued: givenUp.length,
        retried: retriedCount,
        failedRetried: 0,
        error: "Failed-retry lookup failed"
      },
      { status: 500 }
    );
  }

  let failedRetriedCount = 0;
  for (const candidate of failedCandidates ?? []) {
    const currentCount = (candidate.ai_retry_count as number | null) ?? 0;
    const { data: updated, error: failedUpdateError } = await admin
      .from("leads")
      .update({
        ai_status: "processing",
        ai_retry_count: currentCount + 1
      })
      .eq("id", candidate.id as string)
      .eq("org_id", candidate.org_id as string)
      .eq("ai_status", "failed")
      .eq("ai_retry_count", currentCount)
      .select("id");

    if (failedUpdateError) {
      console.warn(
        "rescue-stuck-leads failed-retry CAS update failed for lead",
        candidate.id,
        failedUpdateError
      );
      continue;
    }

    if (!updated || updated.length === 0) {
      // Lost the CAS — another cron tick or a manual edit moved the row.
      // Nothing to do; skip.
      continue;
    }

    const triggerResult = await triggerEstimatorForLead(candidate.id as string);
    if (triggerResult.ok) {
      failedRetriedCount++;
    } else {
      console.warn(
        "rescue-stuck-leads failed-retry trigger failed for lead",
        candidate.id,
        triggerResult.error
      );
    }
  }

  return NextResponse.json({
    rescued: givenUp.length,
    retried: retriedCount,
    failedRetried: failedRetriedCount
  });
}
