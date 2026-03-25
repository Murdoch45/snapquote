import { createAdminClient } from "@/lib/supabase/admin";

export async function getOwnerEmailForOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<string | null> {
  const { data: ownerMembership } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "OWNER")
    .limit(1)
    .maybeSingle();

  if (!ownerMembership?.user_id) return null;

  const userResult = await admin.auth.admin.getUserById(ownerMembership.user_id as string);
  return userResult.data.user?.email ?? null;
}
