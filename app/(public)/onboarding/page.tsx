import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { BrandLogo } from "@/components/BrandLogo";
import { ensureOrganizationMembershipForUser } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membership = await ensureOrganizationMembershipForUser({
    userId: user.id,
    email: user.email
  });

  if (membership?.orgId) {
    const { data: profile } = await supabase
      .from("contractor_profile")
      .select("id")
      .eq("org_id", membership.orgId)
      .maybeSingle();

    if (profile?.id) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="min-h-screen bg-muted px-4 py-10 md:px-6 md:py-14">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-5xl flex-col justify-center">
        <Link
          href="/"
          className="mb-6 inline-flex self-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <BrandLogo size="sm" />
        </Link>
        <OnboardingWizard />
      </div>
    </main>
  );
}
