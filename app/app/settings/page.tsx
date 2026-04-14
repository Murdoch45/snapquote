import {
  DeleteAccountCard,
  ReplayTourCard,
  SignOutCard,
  SettingsForm
} from "@/components/SettingsForm";
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

  const isOwner = auth.role === "OWNER";

  return (
    <div className="space-y-6">
      <SettingsForm initial={profile as any} role={auth.role} />
      <section className="rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="text-base font-semibold text-foreground">Need help?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Have a question or running into an issue? We&apos;re here to help.
        </p>
        <a
          href="mailto:support@snapquote.us"
          className="mt-4 inline-flex rounded-[10px] text-sm font-medium text-primary transition-colors hover:text-primary/90"
        >
          support@snapquote.us
        </a>
      </section>
      {isOwner ? <ReplayTourCard /> : null}
      <SignOutCard />
      <DeleteAccountCard role={auth.role} />
    </div>
  );
}
