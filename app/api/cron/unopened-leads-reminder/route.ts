import { NextResponse } from "next/server";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedBearer } from "@/lib/auth/timingSafeBearer";

export const runtime = "nodejs";
export const maxDuration = 60;

// Audit 12 M3 — threshold previously hardcoded at 10. Now read from
// UNOPENED_LEADS_REMINDER_THRESHOLD env var with the same default so
// behavior is unchanged out of the box. Murdoch can tune in Vercel
// without a redeploy. A non-numeric or sub-1 value falls back to 10
// rather than silently sending to every org (parseInt("abc",10) === NaN).
function getThreshold(): number {
  const raw = process.env.UNOPENED_LEADS_REMINDER_THRESHOLD;
  if (!raw) return 10;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 10;
  return parsed;
}

export async function GET(request: Request) {
  if (!isAuthorizedBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const threshold = getThreshold();

  // Find every org that has at least one registered push device. Iterating
  // by org (not by token) lets sendPushToOrg fan out to every team member's
  // device in a single batch.
  const { data: tokenRows, error: tokenError } = await admin
    .from("push_tokens")
    .select("org_id");

  if (tokenError || !tokenRows || tokenRows.length === 0) {
    return NextResponse.json({ sent: 0, threshold });
  }

  const uniqueOrgIds = Array.from(new Set(tokenRows.map((row) => row.org_id as string)));
  let orgsNotified = 0;

  for (const orgId of uniqueOrgIds) {
    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "NEW");

    if (!count || count < threshold) continue;

    const result = await sendPushToOrg(orgId, {
      title: "You've Got Leads",
      body: `You have ${count} unopened leads. Don't keep them waiting!`,
      data: { screen: "leads" }
    });

    if (result.sent > 0) orgsNotified += 1;
  }

  return NextResponse.json({ sent: orgsNotified, threshold });
}
