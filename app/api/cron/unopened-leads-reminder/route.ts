import { NextResponse } from "next/server";
import { sendExpoPush } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from("contractor_profile")
    .select("org_id, expo_push_token")
    .not("expo_push_token", "is", null);

  if (error || !profiles || profiles.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;

  for (const profile of profiles) {
    const orgId = profile.org_id as string;
    const token = profile.expo_push_token as string;

    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "NEW");

    if (!count || count < 10) continue;

    const ok = await sendExpoPush(token, {
      title: "Leads Waiting",
      body: `You have ${count} unopened leads waiting. Don't keep them waiting!`,
      data: { screen: "leads" }
    });

    if (ok) sent++;
  }

  return NextResponse.json({ sent });
}
