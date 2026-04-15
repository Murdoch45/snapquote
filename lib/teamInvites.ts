import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function deleteExpiredPendingInvites(
  admin: AdminClient,
  orgId?: string
) {
  const nowIso = new Date().toISOString();
  let query = admin
    .from("pending_invites")
    .delete()
    .eq("status", "PENDING")
    .lte("expires_at", nowIso);

  if (orgId) {
    query = query.eq("org_id", orgId);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

export async function getActivePendingInvites(
  admin: AdminClient,
  orgId: string
) {
  await deleteExpiredPendingInvites(admin, orgId);

  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("pending_invites")
    .select("id, org_id, email, role, status, invited_by, expires_at, used_at, created_at, updated_at")
    .eq("org_id", orgId)
    .eq("status", "PENDING")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}
