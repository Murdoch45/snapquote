import Link from "next/link";
import { FinishOnboardingForm } from "@/components/FinishOnboardingForm";
import { PublicBrandLink } from "@/components/PublicBrandLink";
import { SignupForm } from "@/components/SignupForm";

type Props = {
  searchParams?: Promise<{ onboarding?: string }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const onboarding = params?.onboarding === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <PublicBrandLink />
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">
          {onboarding ? "Finish onboarding" : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {onboarding
            ? "Set up your business profile to access the dashboard."
            : "Start capturing leads and sending contractor-approved quotes."}
        </p>
        <div className="mt-6">
          {onboarding ? <FinishOnboardingForm /> : <SignupForm />}
        </div>
        <p className="mt-4 text-sm text-gray-600">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
        </div>
      </div>
    </main>
  );
}
