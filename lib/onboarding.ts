import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/auditLog";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { type ServiceType } from "@/lib/services";
import { randomSuffix, slugify } from "@/lib/utils";
import { buildWelcomeEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";

// Mirrors the format CHECK on organizations.referral_code and the shape
// the /r/[code] route accepts. Keep in sync with that route handler if
// either ever changes.
export const REFERRAL_COOKIE_NAME = "sq_referral_code";
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

async function generateReferralCode(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.rpc("generate_referral_code", { p_length: 8 });
  if (error || typeof data !== "string") {
    throw new Error(error?.message ?? "Unable to generate referral code.");
  }
  return data;
}

/**
 * Best-effort attach of the /r/CODE referral cookie to a freshly-created
 * org. Runs after the org + membership are committed. Any failure here
 * is logged and swallowed — the signup must NEVER fail because the
 * referral lookup was slow, the referrer was deleted, or the cookie was
 * malformed. Self-referral (by org id or owner email) is silently
 * rejected per the locked design constraints.
 */
async function attachReferralFromCookie(opts: {
  admin: SupabaseClient;
  newOrgId: string;
  newUserId: string;
  newUserEmail: string | null;
}): Promise<void> {
  let cookieCode: string | null = null;
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(REFERRAL_COOKIE_NAME)?.value?.trim().toUpperCase() ?? null;
    if (raw && REFERRAL_CODE_PATTERN.test(raw)) {
      cookieCode = raw;
    }
  } catch {
    // No request scope (e.g., called from a script) — nothing to attach.
    return;
  }
  if (!cookieCode) return;

  const clearCookie = async () => {
    try {
      const cs = await cookies();
      cs.delete(REFERRAL_COOKIE_NAME);
    } catch {
      // Read-only cookie context. The 30-day Max-Age ceiling and the
      // UNIQUE(referred_org_id) constraint together keep this safe.
    }
  };

  try {
    const { data: referrerOrg, error: referrerErr } = await opts.admin
      .from("organizations")
      .select("id")
      .eq("referral_code", cookieCode)
      .maybeSingle();

    if (referrerErr) {
      console.warn("[onboarding] referrer lookup failed:", referrerErr);
      await clearCookie();
      return;
    }
    if (!referrerOrg?.id || referrerOrg.id === opts.newOrgId) {
      await clearCookie();
      return;
    }

    const referrerOrgId = referrerOrg.id as string;

    const newEmailNormalized = opts.newUserEmail?.trim().toLowerCase() ?? null;
    if (newEmailNormalized) {
      const referrerOwnerEmail = await getOwnerEmailForOrg(opts.admin, referrerOrgId);
      if (referrerOwnerEmail && referrerOwnerEmail.toLowerCase() === newEmailNormalized) {
        console.warn(
          `[onboarding] self-referral blocked by email match: ${newEmailNormalized}`
        );
        await clearCookie();
        return;
      }
    }

    const { error: insertErr } = await opts.admin.from("referrals").insert({
      referrer_org_id: referrerOrgId,
      referred_org_id: opts.newOrgId,
      code: cookieCode,
      status: "pending"
    });
    if (insertErr) {
      // Most likely 23505 on referred_org_id UNIQUE — a duplicate from
      // a retried bootstrap. Don't surface as an error.
      console.warn("[onboarding] referrals insert skipped:", insertErr);
      await clearCookie();
      return;
    }

    await recordAudit(opts.admin, {
      orgId: opts.newOrgId,
      action: "referral.attached",
      actorUserId: opts.newUserId,
      actorEmail: opts.newUserEmail,
      targetType: "organization",
      targetId: referrerOrgId,
      metadata: { source: "link", code: cookieCode }
    });

    await clearCookie();
  } catch (err) {
    console.warn("[onboarding] referral attach threw:", err);
    await clearCookie();
  }
}

function getDefaultOrganizationName(email?: string | null): string {
  const localPart = email?.split("@")[0]?.trim();
  if (!localPart) return "My Business";

  const normalized = localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) return "My Business";

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getBootstrapOrganizationSlug(userId: string): string {
  return `org-${userId.replace(/-/g, "").slice(0, 24)}`;
}

async function isSlugAvailable(slug: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("contractor_profile")
    .select("id")
    .eq("public_slug", slug)
    .maybeSingle();
  return !data;
}

export async function generateUniquePublicSlug(businessName: string): Promise<string> {
  const base = slugify(businessName).slice(0, 60) || "contractor";
  for (let i = 0; i < 8; i += 1) {
    const candidate = `${base}-${randomSuffix(4)}`;
    // eslint-disable-next-line no-await-in-loop
    if (await isSlugAvailable(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

export async function ensureOrganizationMembershipForUser(opts: {
  userId: string;
  email?: string | null;
}): Promise<{ orgId: string; created: boolean }> {
  const admin = createAdminClient();

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", opts.userId)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("SIGNUP BOOTSTRAP ERROR: organization lookup failed", membershipError);
    throw new Error(membershipError.message);
  }

  if (membership?.org_id) {
    return { orgId: membership.org_id as string, created: false };
  }

  console.warn("No organization found for user, creating fallback organization.");

  const bootstrapName = getDefaultOrganizationName(opts.email);
  const bootstrapSlug = getBootstrapOrganizationSlug(opts.userId);

  // organizations.referral_code is NOT NULL with no DB-side default —
  // Lane 0 backfilled existing rows but every fresh INSERT must supply
  // the value. Generate it via the same RPC that the manual-redeem
  // path uses so collision-and-retry behaviour stays identical.
  const bootstrapReferralCode = await generateReferralCode(admin);

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .insert({
      name: bootstrapName,
      slug: bootstrapSlug,
      referral_code: bootstrapReferralCode
    })
    .select("id")
    .single();

  let orgId: string;
  if (organizationError) {
    // 23505 = unique_violation. The slug is derived from userId, so the
    // only realistic collision is an orphan org left behind by a prior
    // bootstrap that crashed between insert and membership link. Recover
    // by re-using that org — its existing referral_code (whatever it
    // is) is preserved, which is the right call: we never want to
    // silently rotate a contractor's outbound code on retry.
    if ((organizationError as { code?: string }).code === "23505") {
      const { data: existing, error: existingErr } = await admin
        .from("organizations")
        .select("id")
        .eq("slug", bootstrapSlug)
        .single();
      if (existingErr || !existing?.id) {
        console.error("SIGNUP BOOTSTRAP ERROR: org recovery after conflict failed", existingErr);
        throw new Error(existingErr?.message ?? "Unable to recover organization.");
      }
      orgId = existing.id as string;
    } else {
      console.error("SIGNUP BOOTSTRAP ERROR: organization create failed", organizationError);
      throw new Error(organizationError.message);
    }
  } else if (!organization?.id) {
    console.error("SIGNUP BOOTSTRAP ERROR: organization create returned no id");
    throw new Error("Unable to create organization.");
  } else {
    orgId = organization.id as string;
  }
  const { error: linkError } = await admin.from("organization_members").upsert(
    {
      org_id: orgId,
      user_id: opts.userId,
      role: "OWNER"
    },
    { onConflict: "org_id,user_id" }
  );

  if (linkError) {
    console.error("SIGNUP BOOTSTRAP ERROR: membership create failed", linkError);
    throw new Error(linkError.message);
  }

  const { data: confirmedMembership, error: confirmError } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", opts.userId)
    .limit(1)
    .maybeSingle();

  if (confirmError) {
    console.error("SIGNUP BOOTSTRAP ERROR: membership verification failed", confirmError);
    throw new Error(confirmError.message);
  }

  if (!confirmedMembership?.org_id) {
    console.error("No organization found for user.");
    throw new Error("No organization found for user.");
  }

  // Best-effort referral attach. Runs only on this bootstrap-created
  // path (not when an existing membership is returned at line ~63), so
  // we never re-attach for an existing org. Wrapped to absolutely
  // never propagate — signup completes even if the cookie was bogus
  // or the referrer was deleted between link-click and signup.
  await attachReferralFromCookie({
    admin,
    newOrgId: confirmedMembership.org_id as string,
    newUserId: opts.userId,
    newUserEmail: opts.email ?? null
  });

  // Welcome email — only fires on the first-time bootstrap path. We have
  // the user's email in opts.email so we don't need to look it up. Best
  // effort: a failure here should not block onboarding.
  if (opts.email) {
    const welcome = buildWelcomeEmail();
    void sendEmail({
      to: opts.email,
      subject: welcome.subject,
      text: welcome.text,
      html: welcome.html,
      sender: "noreply"
    }).catch((error) => {
      console.warn("Welcome email send failed:", error);
    });
  }

  return { orgId: confirmedMembership.org_id as string, created: true };
}

export async function ensureUserHasOrganization(opts: {
  userId: string;
  email?: string | null;
  businessName: string;
  services: ServiceType[];
  mobileContractor: boolean;
  formattedAddress: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
}): Promise<{ orgId: string; slug: string }> {
  const admin = createAdminClient();

  const { orgId, created: createdMembership } = await ensureOrganizationMembershipForUser({
    userId: opts.userId,
    email: opts.email
  });

  // Compensating-rollback boundary. If anything below fails AND the
  // membership was created in this call, undo it so the user is never
  // left as a member of an org with no contractor_profile (which would
  // crash every screen that calls getProfile.single()).
  try {
    const { data: profile, error: profileLookupError } = await admin
      .from("contractor_profile")
      .select("public_slug")
      .eq("org_id", orgId)
      .maybeSingle();

    if (profileLookupError) {
      console.error("ONBOARDING ERROR: profile lookup failed", profileLookupError);
      throw new Error(profileLookupError.message);
    }

    const slug = profile?.public_slug ?? (await generateUniquePublicSlug(opts.businessName));

    const profilePayload = {
      org_id: orgId,
      business_name: opts.businessName,
      public_slug: slug,
      email: opts.email ?? null,
      services: opts.services,
      business_address_full: opts.formattedAddress,
      business_address_place_id: opts.placeId,
      business_lat: opts.latitude,
      business_lng: opts.longitude,
      mobile_contractor: opts.mobileContractor,
      travel_pricing_disabled: opts.mobileContractor,
      notification_lead_email: Boolean(opts.email)
    };

    const { error: profileError } = await admin
      .from("contractor_profile")
      .upsert(profilePayload, { onConflict: "org_id" });

    if (profileError) {
      console.error("ONBOARDING ERROR:", profileError);
      throw new Error(profileError.message);
    }

    const { error: updateOrgError } = await admin
      .from("organizations")
      .update({ name: opts.businessName })
      .eq("id", orgId);

    if (updateOrgError) {
      console.warn("ONBOARDING WARNING: organization update failed", updateOrgError);
    }

    return { orgId, slug };
  } catch (error) {
    if (createdMembership) {
      const { error: rollbackMemberError } = await admin
        .from("organization_members")
        .delete()
        .eq("user_id", opts.userId)
        .eq("org_id", orgId);
      if (rollbackMemberError) {
        console.error("ONBOARDING ROLLBACK: membership delete failed", rollbackMemberError);
      }
      const { error: rollbackOrgError } = await admin
        .from("organizations")
        .delete()
        .eq("id", orgId);
      if (rollbackOrgError) {
        console.error("ONBOARDING ROLLBACK: organization delete failed", rollbackOrgError);
      }
    }
    throw error;
  }
}
