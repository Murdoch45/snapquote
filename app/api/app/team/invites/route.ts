import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePendingInvites } from "@/lib/teamInvites";

export async function GET(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const invites = await getActivePendingInvites(admin, auth.orgId);

    return NextResponse.json({ invites });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load invites."
      },
      { status: 500 }
    );
  }
}
