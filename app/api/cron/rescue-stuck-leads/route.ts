import { NextResponse } from "next/server";
import { sendNewLeadNotifications } from "@/lib/ai/estimate";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const STUCK_THRESHOLD_MINUTES = 5;
const STUCK_NOTE = "Estimator timed out before completing. The lead was auto-marked as failed so the contractor still gets notified.";

/**
 * Rescues leads stuck at ai_status="processing" past the estimator's normal
 * completion window. Idempotent — the UPDATE filters on ai_status so rows
 * already flipped to "ready" or "failed" won't be touched on the next run.
 * Runs every few minutes from vercel.json.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();

  // CAS update: flip only rows still in "processing" at read time. If two
  // cron invocations race, the second one's update matches zero rows and
  // returns an empty array — no duplicate notifications.
  const { data: stuckLeads, error } = await admin
    .from("leads")
    .update({
      ai_status: "failed",
      ai_estimator_notes: STUCK_NOTE
    })
    .eq("ai_status", "processing")
    .lt("submitted_at", cutoff)
    .select("id,org_id,address_full");

  if (error) {
    console.error("rescue-stuck-leads update failed:", error);
    return NextResponse.json({ error: "Rescue failed" }, { status: 500 });
  }

  const rows = stuckLeads ?? [];

  for (const lead of rows) {
    try {
      await sendNewLeadNotifications(admin, {
        leadId: lead.id as string,
        orgId: lead.org_id as string,
        addressFull: (lead.address_full as string | null) ?? null
      });
    } catch (notifyError) {
      console.error("rescue-stuck-leads notification failed for lead", lead.id, notifyError);
    }
  }

  return NextResponse.json({ rescued: rows.length });
}
