import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { BrandLogo } from "@/components/BrandLogo";
import { EmailNotConfirmedError, ensureOrganizationMembershipForUser } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // OAuth users (Apple, Google) have email_confirmed_at set automatically;
  // email/password signups must verify before we provision an org for them.
  if (!user.email_confirmed_at) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-md flex-col items-center justify-center text-center">
          <Link
            href="/"
            className="mb-6 inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <BrandLogo size="sm" />
          </Link>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            Confirm your email to continue
          </h1>
          <p className="text-sm text-gray-600">
            We sent a confirmation link to <strong>{user.email}</strong>. Click the link
            in that email, then return to SnapQuote to finish setting up your account.
          </p>
        </div>
      </main>
    );
  }

  let membership: { orgId: string; created: boolean } | null = null;
  try {
    membership = await ensureOrganizationMembershipForUser({
      userId: user.id,
      email: user.email,
      emailConfirmedAt: user.email_confirmed_at
    });
  } catch (error) {
    if (!(error instanceof EmailNotConfirmedError)) throw error;
  }

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
    <main className="min-h-screen bg-gray-50 px-4 py-10 md:px-6 md:py-14">
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
