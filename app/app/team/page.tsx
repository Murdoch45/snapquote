import { TeamManager } from "@/components/TeamManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function TeamPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const [{ data: members }, { data: invites }, { data: org }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("org_id", auth.orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("pending_invites")
      .select("id, email, role, status, created_at, expires_at, token")
      .eq("org_id", auth.orgId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false }),
    supabase.from("organizations").select("plan").eq("id", auth.orgId).single()
  ]);

  const admin = createAdminClient();
  const membersWithEmail = await Promise.all(
    (members ?? []).map(async (member) => {
      const userResult = await admin.auth.admin.getUserById(member.user_id as string);
      return {
        ...member,
        user_email: userResult.data.user?.email ?? null
      };
    })
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-[#111827]">Team</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#6B7280]">
            Current plan: <span className="font-medium text-[#111827]">{org?.plan}</span>. Admins
            can invite or remove members.
          </p>
        </CardContent>
      </Card>
      <TeamManager
        isOwner={auth.role === "OWNER"}
        members={membersWithEmail as any}
        invites={(invites ?? []) as any}
      />
    </div>
  );
}
