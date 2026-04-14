import Link from "next/link";
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
      .select("business_name, public_slug")
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
      <OnboardingTour
        enabled={!Boolean(organization?.onboarding_completed)}
        slug={profile?.public_slug as string | null | undefined}
      />
      <AppShell
        email={user?.email}
        orgId={auth.orgId}
        businessName={(profile?.business_name as string) ?? "SnapQuote"}
      >
        {process.env.DEMO_ORG_ID && auth.orgId === process.env.DEMO_ORG_ID ? (
          <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <strong className="font-semibold">Demo workspace:</strong> you&apos;re
            viewing read-only sample data. Edits, deletions, and outgoing
            messages are disabled.{" "}
            <Link href="/signup" className="font-semibold underline hover:no-underline">
              Sign up for your own workspace.
            </Link>
          </div>
        ) : null}
        <UpgradeBanner {...usage} />
        {children}
      </AppShell>
    </>
  );
}
