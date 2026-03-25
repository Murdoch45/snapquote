import { OnboardingTour } from "@/components/OnboardingTour";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
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
    <div className="min-h-screen bg-[#F8F9FC]">
      <Sidebar businessName={(profile?.business_name as string) ?? "SnapQuote"} />
      <OnboardingTour enabled={!Boolean(organization?.onboarding_completed)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-[220px]">
        <TopBar
          email={user?.email}
          orgId={auth.orgId}
          businessName={(profile?.business_name as string) ?? "SnapQuote"}
        />
        <main className="flex-1 space-y-6 bg-[#F8F9FC] p-4 md:p-6">
          <UpgradeBanner {...usage} />
          {children}
        </main>
      </div>
    </div>
  );
}
