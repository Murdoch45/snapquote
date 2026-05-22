import { ActivityTracker } from "@/components/ActivityTracker";
import { AppShell } from "@/components/AppShell";
import { MyLinkPageClient } from "@/components/MyLinkPageClient";
import { OutOfCreditsBanner } from "@/components/OutOfCreditsBanner";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getReferralSummary } from "@/lib/referrals/getReferralSummary";
import {
  buildDefaultSocialCaption,
  resolveBusinessNameForCaption
} from "@/lib/socialCaption";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrgPlan } from "@/lib/types";
import { getAppUrl } from "@/lib/utils";

export default async function MyLinkPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const [
    {
      data: { user }
    },
    { data: profile },
    { data: organization },
    referralSummary
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("contractor_profile")
      .select("business_name, public_slug, social_caption")
      .eq("org_id", auth.orgId)
      .single(),
    supabase
      .from("organizations")
      .select("name, plan, monthly_credits, bonus_credits")
      .eq("id", auth.orgId)
      .single(),
    getReferralSummary(auth.orgId)
  ]);

  const orgPlan = (organization?.plan as OrgPlan | null) ?? "SOLO";
  const monthlyCredits = Number(organization?.monthly_credits ?? 0);
  const bonusCredits = Number(organization?.bonus_credits ?? 0);

  if (!profile?.public_slug || !profile?.business_name) {
    return (
      <AppShell
        email={user?.email}
        orgId={auth.orgId}
        businessName={(profile?.business_name as string) ?? "SnapQuote"}
      >
        <ActivityTracker />
        <OutOfCreditsBanner
          plan={orgPlan}
          monthlyCredits={monthlyCredits}
          bonusCredits={bonusCredits}
        />
        <p className="text-sm text-red-600">Contractor profile not found.</p>
      </AppShell>
    );
  }

  const businessName = profile.business_name as string;
  const requestLink = `${getAppUrl()}/${profile.public_slug as string}`;
  const captionBusinessName = resolveBusinessNameForCaption({
    profileBusinessName: profile.business_name as string | null | undefined,
    organizationName: organization?.name as string | null | undefined
  });
  const initialSocialCaption =
    (profile.social_caption as string | null) ??
    buildDefaultSocialCaption({ businessName: captionBusinessName, requestLink });

  return (
    <AppShell email={user?.email} orgId={auth.orgId} businessName={businessName}>
      <ActivityTracker />
      <OutOfCreditsBanner
        plan={orgPlan}
        monthlyCredits={monthlyCredits}
        bonusCredits={bonusCredits}
      />
      <MyLinkPageClient
        businessName={businessName}
        requestLink={requestLink}
        initialSocialCaption={initialSocialCaption}
        canEditCaption={auth.role === "OWNER"}
        referralSummary={referralSummary}
      />
    </AppShell>
  );
}
