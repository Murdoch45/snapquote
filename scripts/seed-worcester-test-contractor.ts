import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SERVICE_OPTIONS } from "../lib/services";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const CONTRACTOR_SLUG = "worcester-test";
const BUSINESS_NAME = "Worcester Test Contractor";
const BUSINESS_ADDRESS = "21 Kendall St, Worcester, MA 01605";
const BUSINESS_LAT = 42.272913;
const BUSINESS_LNG = -71.792058;

async function ensureOrganization(orgSlug: string) {
  const { data: existingOrg, error: orgLookupError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgLookupError) {
    throw new Error(`Failed to check organizations: ${orgLookupError.message}`);
  }

  if (existingOrg?.id) {
    return existingOrg.id as string;
  }

  const { data: createdOrg, error: createOrgError } = await supabase
    .from("organizations")
    .insert({
      name: BUSINESS_NAME,
      slug: orgSlug,
      plan: "SOLO"
    })
    .select("id")
    .single();

  if (createOrgError || !createdOrg?.id) {
    throw new Error(`Failed to create organization: ${createOrgError?.message ?? "Unknown error"}`);
  }

  return createdOrg.id as string;
}

async function ensureOrgHasSubscriptionEligibleMember(orgId: string) {
  const { data: existingMembers, error: existingMembersError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .limit(1);

  if (existingMembersError) {
    throw new Error(`Failed to check organization members: ${existingMembersError.message}`);
  }

  if ((existingMembers ?? []).length > 0) {
    return;
  }

  const { data: activeSub, error: activeSubError } = await supabase
    .from("subscriptions")
    .select("user_id,status,created_at")
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeSubError) {
    throw new Error(`Failed to find subscription-eligible user: ${activeSubError.message}`);
  }

  const userId = activeSub?.user_id as string | null | undefined;
  if (!userId) {
    throw new Error(
      "No active/trialing subscription user found. Add one member with a valid subscription before Worcester test runs."
    );
  }

  const { error: memberInsertError } = await supabase.from("organization_members").insert({
    org_id: orgId,
    user_id: userId,
    role: "OWNER"
  });

  if (memberInsertError) {
    throw new Error(`Failed to add subscription-eligible org member: ${memberInsertError.message}`);
  }
}

async function main() {
  const { data: existing, error: existingError } = await supabase
    .from("contractor_profile")
    .select("public_slug,business_address_full")
    .eq("public_slug", CONTRACTOR_SLUG)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check contractor profile: ${existingError.message}`);
  }

  if (existing?.public_slug) {
    const { data: existingContractor, error: existingContractorError } = await supabase
      .from("contractor_profile")
      .select("org_id")
      .eq("public_slug", CONTRACTOR_SLUG)
      .single();

    if (existingContractorError || !existingContractor?.org_id) {
      throw new Error(`Failed to load existing Worcester contractor org: ${existingContractorError?.message ?? "Unknown error"}`);
    }

    await ensureOrgHasSubscriptionEligibleMember(existingContractor.org_id as string);
    console.log("Worcester contractor already exists:", {
      public_slug: existing.public_slug,
      business_address_full: existing.business_address_full
    });
    return;
  }

  const orgId = await ensureOrganization("worcester-test-org");
  await ensureOrgHasSubscriptionEligibleMember(orgId);

  const { data: inserted, error: insertError } = await supabase
    .from("contractor_profile")
    .insert({
      org_id: orgId,
      business_name: BUSINESS_NAME,
      public_slug: CONTRACTOR_SLUG,
      business_address_full: BUSINESS_ADDRESS,
      business_lat: BUSINESS_LAT,
      business_lng: BUSINESS_LNG,
      services: SERVICE_OPTIONS
    })
    .select("public_slug,business_address_full")
    .single();

  if (insertError || !inserted?.public_slug) {
    throw new Error(`Failed to create Worcester contractor profile: ${insertError?.message ?? "Unknown error"}`);
  }

  console.log("Created Worcester contractor profile:", inserted);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
