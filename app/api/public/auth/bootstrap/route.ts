import { NextResponse } from "next/server";
import { ensureOrganizationMembershipForUser } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await ensureOrganizationMembershipForUser({
      userId: user.id,
      email: user.email
    });

    return NextResponse.json({ ok: true, orgId: result.orgId });
  } catch (error) {
    console.error("SIGNUP BOOTSTRAP ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create organization." },
      { status: 500 }
    );
  }
}
