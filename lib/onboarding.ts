import { createAdminClient } from "@/lib/supabase/admin";
import { type ServiceType } from "@/lib/services";
import { randomSuffix, slugify } from "@/lib/utils";

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
}): Promise<{ orgId: string }> {
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
    return { orgId: membership.org_id as string };
  }

  console.warn("No organization found for user, creating fallback organization", {
    user_id: opts.userId
  });

  const bootstrapName = getDefaultOrganizationName(opts.email);
  const bootstrapSlug = getBootstrapOrganizationSlug(opts.userId);

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .upsert(
      {
        name: bootstrapName,
        slug: bootstrapSlug
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (organizationError || !organization?.id) {
    console.error("SIGNUP BOOTSTRAP ERROR: organization create failed", organizationError);
    throw new Error(organizationError?.message ?? "Unable to create organization.");
  }

  const orgId = organization.id as string;
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
    console.error("No organization found for user", { user_id: opts.userId });
    throw new Error("No organization found for user.");
  }

  return { orgId: confirmedMembership.org_id as string };
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

  console.log("USER:", opts.userId);

  const { orgId } = await ensureOrganizationMembershipForUser({
    userId: opts.userId,
    email: opts.email
  });

  console.log("ORG LOOKUP RESULT:", { org_id: orgId });

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
  console.log({
    user_id: opts.userId,
    organization_id: orgId,
    business_name: opts.businessName,
    services: opts.services
  });

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
    console.error("ONBOARDING ERROR: organization update failed", updateOrgError);
    throw new Error(updateOrgError.message);
  }

  return { orgId, slug };
}
