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
      .select("id, email, role, status, created_at")
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Current plan: <span className="font-medium text-gray-900">{org?.plan}</span>. Owner can
            invite or remove members.
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
