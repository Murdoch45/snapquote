import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/auditLog";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Same shape the cookie path uses. Mirrors the DB-level format CHECK
// on organizations.referral_code (Lane 0).
const redeemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6)
    .max(12)
    .transform((s) => s.toUpperCase())
    .refine((s) => /^[A-Z0-9]{6,12}$/.test(s), { message: "Invalid referral code." })
});

// 7-day window from org creation, measured in milliseconds. Matches the
// design-constraint window described in the audit. The window closes
// on: code entry, upgrade to paid, or expiry — whichever first.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Tight bucket because manual code entry is a one-shot user action; if
// a single owner tries more than this in a minute it's almost certainly
// scripted enumeration of the code space.
const REDEEM_LIMIT_PER_MINUTE = 5;
const REDEEM_WINDOW_MS = 60_000;

function badRequest(message: string, code: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

export async function POST(request: Request): Promise<NextResponse> {
  // requireOwnerForApi already returns 403 for the demo org and for
  // non-owner roles. We don't need a separate DEMO_ORG_ID guard.
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  const allowed = await rateLimit(
    `referral-redeem:${auth.userId}`,
    REDEEM_LIMIT_PER_MINUTE,
    REDEEM_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  let body: z.infer<typeof redeemSchema>;
  try {
    body = redeemSchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message ?? "Invalid code." : "Invalid code.";
    return badRequest(message, "INVALID_CODE");
  }

  const admin = createAdminClient();
  const enteredCode = body.code;

  // Load the caller's org alongside the dedupe check in one round-trip.
  // We need: created_at (for the 7-day window), plan (must still be
  // SOLO), referral_code (to reject self-redeem of own code), and the
  // existence of an inbound referral row (one-per-org rule).
  const [{ data: callerOrg, error: callerOrgErr }, { data: existingReferral, error: existingErr }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id, created_at, plan, referral_code")
        .eq("id", auth.orgId)
        .single(),
      admin
        .from("referrals")
        .select("id")
        .eq("referred_org_id", auth.orgId)
        .maybeSingle()
    ]);

  if (callerOrgErr || !callerOrg) {
    return badRequest("Organization not found.", "ORG_NOT_FOUND");
  }
  if (existingErr) {
    return badRequest("Unable to check referral status.", "REFERRAL_CHECK_FAILED");
  }
  if (existingReferral?.id) {
    return badRequest("This account already has a referral attached.", "ALREADY_REFERRED");
  }

  const ageMs = Date.now() - new Date(callerOrg.created_at as string).getTime();
  if (ageMs > SEVEN_DAYS_MS) {
    return badRequest(
      "Referral codes can only be entered within 7 days of signup.",
      "WINDOW_CLOSED"
    );
  }

  if (callerOrg.plan !== "SOLO") {
    // Per locked decisions: window also closes on upgrade to a paid
    // plan. A non-SOLO caller cannot retro-attach a referral.
    return badRequest(
      "Referral codes can only be entered before upgrading to a paid plan.",
      "WINDOW_CLOSED"
    );
  }

  if (callerOrg.referral_code === enteredCode) {
    return badRequest("You can't redeem your own referral code.", "OWN_CODE");
  }

  const { data: referrerOrg, error: referrerErr } = await admin
    .from("organizations")
    .select("id")
    .eq("referral_code", enteredCode)
    .maybeSingle();

  if (referrerErr) {
    return badRequest("Unable to look up referral code.", "LOOKUP_FAILED");
  }
  if (!referrerOrg?.id || referrerOrg.id === auth.orgId) {
    return badRequest("That referral code isn't valid.", "INVALID_CODE");
  }

  const referrerOrgId = referrerOrg.id as string;

  // Self-referral guard by email — same logic the cookie path uses.
  // We have auth.userEmail from the JWT, so no extra round-trip needed
  // for the caller side; we only look up the referrer's owner.
  const callerEmailNormalized = auth.userEmail?.trim().toLowerCase() ?? null;
  if (callerEmailNormalized) {
    const referrerOwnerEmail = await getOwnerEmailForOrg(admin, referrerOrgId);
    if (referrerOwnerEmail && referrerOwnerEmail.toLowerCase() === callerEmailNormalized) {
      return badRequest("You can't redeem your own referral code.", "SELF_REFERRAL");
    }
  }

  const { error: insertErr } = await admin.from("referrals").insert({
    referrer_org_id: referrerOrgId,
    referred_org_id: auth.orgId,
    code: enteredCode,
    status: "pending"
  });

  if (insertErr) {
    // 23505 means another tab or request beat us to it. Surface a clean
    // "already referred" rather than the raw constraint name.
    if ((insertErr as { code?: string }).code === "23505") {
      return badRequest("This account already has a referral attached.", "ALREADY_REFERRED");
    }
    return badRequest("Unable to attach referral.", "INSERT_FAILED");
  }

  await recordAudit(admin, {
    orgId: auth.orgId,
    action: "referral.attached",
    actorUserId: auth.userId,
    actorEmail: auth.userEmail,
    targetType: "organization",
    targetId: referrerOrgId,
    metadata: { source: "manual", code: enteredCode }
  });

  return NextResponse.json({ ok: true });
}
