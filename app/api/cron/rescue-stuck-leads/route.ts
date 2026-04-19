import { NextResponse } from "next/server";
import { triggerEstimatorForLead } from "@/lib/ai/triggerEstimator";
import { sendNewLeadNotifications } from "@/lib/ai/estimate";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Leads stuck in "processing" past this horizon get acted on. Kept well
// above the estimator's own 40s timeout so a lead that is legitimately
// still running doesn't get thrashed by a retry.
const STUCK_THRESHOLD_MINUTES = 5;

// After this many total minutes of "processing", we give up on retrying
// and mark the lead failed so the contractor still gets a notification.
// Picked to allow ~2 retry windows (each ~3 minutes via vercel.json
// schedule) before giving up.
const GIVE_UP_MINUTES = 15;

const STUCK_NOTE =
  "Estimator timed out before completing. The lead was auto-marked as failed so the contractor still gets notified.";

/**
 * Rescues leads stuck at ai_status="processing" past the estimator's
 * normal completion window.
 *
 * Two-stage recovery:
 *   1. Between STUCK_THRESHOLD_MINUTES and GIVE_UP_MINUTES: re-trigger
 *      the estimator by invoking the run-estimator edge function. The
 *      lead row stays in "processing" so the next run of this cron will
 *      see it again if the retry also fails.
 *   2. Past GIVE_UP_MINUTES: flip to "failed" and fire the full
 *      notification chain (push, in-app, contractor email) so the
 *      contractor isn't ghosted even on a total estimator outage.
 *
 * The UPDATE is a CAS on ai_status so concurrent cron runs don't double-
 * notify.
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

  // Stage 2 first: mark long-stuck leads failed and notify. We do this
  // before retry so the same lead can't get pulled into both buckets on
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

  // Stage 1: re-trigger estimator for leads stuck between the retry
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

  return NextResponse.json({ rescued: givenUp.length, retried: retriedCount });
}
