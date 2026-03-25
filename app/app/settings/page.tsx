import { SettingsForm } from "@/components/SettingsForm";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const profileRes = await supabase
    .from("contractor_profile")
    .select(
      "business_name,public_slug,phone,email,services,business_address_full,business_address_place_id,business_lat,business_lng,quote_sms_template,travel_pricing_disabled,notification_lead_email,notification_accept_email"
    )
    .eq("org_id", auth.orgId)
    .single();

  const profile = profileRes.data;

  if (!profile) {
    return <p className="text-sm text-red-600">Contractor profile not found.</p>;
  }

  return <SettingsForm initial={profile as any} />;
}
