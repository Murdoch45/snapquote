import { NextResponse } from "next/server";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find every org that has at least one registered push device. Iterating
  // by org (not by token) lets sendPushToOrg fan out to every team member's
  // device in a single batch.
  const { data: tokenRows, error: tokenError } = await admin
    .from("push_tokens")
    .select("org_id");

  if (tokenError || !tokenRows || tokenRows.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const uniqueOrgIds = Array.from(new Set(tokenRows.map((row) => row.org_id as string)));
  let orgsNotified = 0;

  for (const orgId of uniqueOrgIds) {
    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "NEW");

    if (!count || count < 10) continue;

    const result = await sendPushToOrg(orgId, {
      title: "You've Got Leads",
      body: `You have ${count} unopened leads. Don't keep them waiting!`,
      data: { screen: "leads" }
    });

    if (result.sent > 0) orgsNotified += 1;
  }

  return NextResponse.json({ sent: orgsNotified });
}
