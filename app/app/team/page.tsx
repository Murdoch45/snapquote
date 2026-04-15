import { TeamManager } from "@/components/TeamManager";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getPlanSeatLimit } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActivePendingInvites } from "@/lib/teamInvites";

export default async function TeamPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  const [{ data: members }, invites] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("org_id", auth.orgId)
      .order("created_at", { ascending: true }),
    getActivePendingInvites(admin, auth.orgId)
  ]);

  const membersWithEmail = await Promise.all(
    (members ?? []).map(async (member) => {
      const userResult = await admin.auth.admin.getUserById(member.user_id as string);
      return {
        ...member,
        user_email: userResult.data.user?.email ?? null
      };
    })
  );

  const isSoloWorkspace =
    membersWithEmail.length <= 1 && (invites ?? []).length === 0;

  return (
    <div className="space-y-6">
      {isSoloWorkspace && auth.role === "OWNER" ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-start gap-2 py-6">
            <h3 className="text-base font-semibold text-foreground">
              You&apos;re flying solo
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Invite a teammate below to share leads, send estimates together,
              and keep everyone in sync. Team plan includes up to {getPlanSeatLimit("TEAM")} seats.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <TeamManager
        isOwner={auth.role === "OWNER"}
        members={membersWithEmail as any}
        invites={invites as any}
      />
    </div>
  );
}
