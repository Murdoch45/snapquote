import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanSeatLimit } from "@/lib/plans";
import type { OrgPlan } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

export class SeatLimitReachedError extends Error {
  statusCode: number;
  code: string;
  seatLimit: number;
  membersCount: number;
  pendingInvitesCount: number;

  constructor(args: { seatLimit: number; membersCount: number; pendingInvitesCount: number }) {
    const totalClaimed = args.membersCount + args.pendingInvitesCount;
    super(
      `Your plan allows ${args.seatLimit} ${args.seatLimit === 1 ? "seat" : "seats"}. ` +
        `You already have ${args.membersCount} member${args.membersCount === 1 ? "" : "s"}` +
        (args.pendingInvitesCount > 0
          ? ` and ${args.pendingInvitesCount} pending invite${args.pendingInvitesCount === 1 ? "" : "s"}`
          : "") +
        ` (${totalClaimed}/${args.seatLimit}). Remove a member, revoke a pending invite, or upgrade your plan before sending another.`
    );
    this.name = "SeatLimitReachedError";
    this.statusCode = 409;
    this.code = "SEAT_LIMIT_REACHED";
    this.seatLimit = args.seatLimit;
    this.membersCount = args.membersCount;
    this.pendingInvitesCount = args.pendingInvitesCount;
  }
}

/**
 * Pre-flight seat check at invite creation. The RPC `accept_invite_token`
 * enforces the limit at acceptance time — but only rejecting there means
 * owners can queue up unlimited invites that will all fail later. Surfacing
 * the error here gives immediate feedback.
 *
 * Counts active members + unexpired pending invites. Caller should invoke
 * `deleteExpiredPendingInvites` first so expired rows don't inflate the count.
 */
export async function assertSeatAvailable(admin: AdminClient, orgId: string): Promise<void> {
  const [{ data: org, error: orgError }, membersResult, pendingResult] = await Promise.all([
    admin.from("organizations").select("plan").eq("id", orgId).single(),
    admin
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId),
    admin
      .from("pending_invites")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "PENDING")
      .gt("expires_at", new Date().toISOString())
  ]);

  if (orgError || !org) {
    throw orgError ?? new Error("Organization not found.");
  }

  const plan = (org.plan as OrgPlan | null) ?? "SOLO";
  const seatLimit = getPlanSeatLimit(plan);
  const membersCount = membersResult.count ?? 0;
  const pendingInvitesCount = pendingResult.count ?? 0;

  if (membersCount + pendingInvitesCount >= seatLimit) {
    throw new SeatLimitReachedError({ seatLimit, membersCount, pendingInvitesCount });
  }
}

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
