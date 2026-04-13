import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron — deletes notifications older than 7 days.
 * The 50-per-org cap is handled by the database trigger on INSERT;
 * this cron handles the time-based expiry.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("notifications")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("cleanup-notifications failed:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  return NextResponse.json({ deleted: data?.length ?? 0 });
}
