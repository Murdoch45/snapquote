import { createAdminClient } from "@/lib/supabase/admin";
import { type ServiceType } from "@/lib/services";
import { randomSuffix, slugify } from "@/lib/utils";

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

export async function ensureUserHasOrganization(opts: {
  userId: string;
  email?: string | null;
  businessName: string;
  phone?: string | null;
  services: ServiceType[];
}): Promise<{ orgId: string; slug: string }> {
  const admin = createAdminClient();

  const { data: member } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (member?.org_id) {
    const { data: profile } = await admin
      .from("contractor_profile")
      .select("public_slug")
      .eq("org_id", member.org_id)
      .single();

    const { error: updateProfileError } = await admin
      .from("contractor_profile")
      .update({
        business_name: opts.businessName,
        phone: opts.phone ?? null,
        email: opts.email ?? null,
        services: opts.services,
        notification_lead_email: Boolean(opts.email)
      })
      .eq("org_id", member.org_id);
    if (updateProfileError) throw updateProfileError;

    return { orgId: member.org_id as string, slug: profile?.public_slug as string };
  }

  const slug = await generateUniquePublicSlug(opts.businessName);
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: opts.businessName,
      slug: slugify(opts.businessName),
      plan: "SOLO"
    })
    .select("id")
    .single();
  if (orgError || !org) throw orgError || new Error("Failed to create organization.");

  const orgId = org.id as string;

  const { error: memberError } = await admin.from("organization_members").insert({
    org_id: orgId,
    user_id: opts.userId,
    role: "OWNER"
  });
  if (memberError) throw memberError;

  const { error: profileError } = await admin.from("contractor_profile").insert({
    org_id: orgId,
    business_name: opts.businessName,
    public_slug: slug,
    phone: opts.phone,
    email: opts.email,
    services: opts.services,
    notification_lead_email: Boolean(opts.email)
  });
  if (profileError) throw profileError;

  return { orgId, slug };
}
