import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isAuthorizedBearer } from "@/lib/auth/timingSafeBearer";
import { processReferralEmailFollowups } from "@/lib/referralEmails";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron — releases queued "second" referral emails for orgs whose
 * 3-week floor (referral_email_second_due_at) has elapsed. See
 * lib/referralEmails.ts for the trigger orchestration; this route is
 * purely the cron entrypoint.
 *
 * Idempotency lives inside processReferralEmailFollowups — each org's
 * send is gated by an UPDATE-WHERE-NULL atomic claim on
 * organizations.referral_email_second_sent_at, so a retry of this cron
 * cannot double-send. Schedule lives in vercel.json.
 */
export async function GET(request: Request) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processReferralEmailFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: "cron", stage: "referral-email-followup" }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed." },
      { status: 500 }
    );
  }
}
