import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ onboarding_completed: true })
      .eq("id", auth.orgId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete onboarding tour." },
      { status: 400 }
    );
  }
}
