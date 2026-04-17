import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sensitive operations worth a paper trail. Append to this list when
 * adding a new auditable action so all writers stay in sync.
 */
export type AuditAction =
  | "account.deleted"
  | "plan.changed"
  | "team.member_removed"
  | "team.invite_sent"
  | "team.invite_accepted"
  | "member.self_removed"
  | "settings.updated"
  | "settings.password_changed"
  | "credits.purchased"
  // High-value lead/estimate transactions worth a paper trail. Unlocks
  // charge a credit and reveal customer PII; sends dispatch email/SMS
  // through Resend + Telnyx with real per-message cost. Both are the
  // kinds of actions a contractor might later dispute or need to audit
  // team activity against.
  | "lead.unlocked"
  | "quote.sent";

type RecordAuditInput = {
  orgId: string;
  action: AuditAction;
  actorUserId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
};

/**
 * Best-effort audit log write. Failures are logged and swallowed —
 * audit logging must NEVER block a real operation.
 *
 * Pass an admin (service-role) supabase client; RLS would otherwise
 * block writes from authenticated user contexts.
 */
export async function recordAudit(
  admin: SupabaseClient,
  input: RecordAuditInput
): Promise<void> {
  try {
    const { error } = await admin.from("audit_log").insert({
      org_id: input.orgId,
      actor_user_id: input.actorUserId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
      ip_address: input.ipAddress ?? null
    });
    if (error) {
      console.warn("[auditLog] insert failed:", input.action, error);
    }
  } catch (err) {
    console.warn("[auditLog] threw:", input.action, err);
  }
}
