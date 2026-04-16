import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { rateLimit } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * POST /api/app/activity/touch
 *
 * Records that a member of the caller's org has opened the app. Powers the
 * 30-day inactivity gate on /api/public/lead-submit for Solo plans.
 *
 * Accepts both web session cookies and mobile Bearer tokens via
 * requireMemberForApi. Rate-limited to ~1 write per 5 minutes per org so a
 * misbehaving client can't thrash the row. Any failure is swallowed and
 * reported as ok=true so the client's UX is never blocked on telemetry.
 */
export async function POST(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  if (!rateLimit(`activity-touch:${auth.orgId}`, 1, FIVE_MINUTES_MS)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", auth.orgId);

    if (error) {
      console.warn("activity-touch update failed:", error);
      return NextResponse.json({ ok: true, skipped: true });
    }
  } catch (error) {
    console.warn("activity-touch exception:", error);
    return NextResponse.json({ ok: true, skipped: true });
  }

  return NextResponse.json({ ok: true });
}
