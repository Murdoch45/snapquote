import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/onboarding/reset
 *
 * Owner-only. Clears the org's onboarding_completed flag so the next
 * dashboard load shows the post-onboarding tour again. Used for the
 * "Replay product tour" button in settings.
 */
export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ onboarding_completed: false })
    .eq("id", auth.orgId);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Unable to reset tour." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
