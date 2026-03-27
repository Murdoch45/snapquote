import { AppShell } from "@/components/AppShell";
import { OnboardingTour } from "@/components/OnboardingTour";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const [
    {
      data: { user }
    },
    { data: profile },
    { data: organization },
    usage
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("contractor_profile")
      .select("business_name")
      .eq("org_id", auth.orgId)
      .single(),
    supabase
      .from("organizations")
      .select("onboarding_completed")
      .eq("id", auth.orgId)
      .single(),
    getMonthlyUsage(auth.orgId)
  ]);

  return (
    <>
      <OnboardingTour enabled={!Boolean(organization?.onboarding_completed)} />
      <AppShell
        email={user?.email}
        orgId={auth.orgId}
        businessName={(profile?.business_name as string) ?? "SnapQuote"}
      >
        <UpgradeBanner {...usage} />
        {children}
      </AppShell>
    </>
  );
}
