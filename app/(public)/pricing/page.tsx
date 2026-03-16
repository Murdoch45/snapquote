import Link from "next/link";
import { PricingPlans } from "@/components/PricingPlans";
import { PublicBrandLink } from "@/components/PublicBrandLink";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff,_#ffffff_52%,_#ecfeff)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 md:py-24">
        <div className="flex items-center justify-between gap-4">
          <PublicBrandLink />
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>

        <section className="max-w-3xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">
            Stripe Billing
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
            Start SnapQuote with a 14-day free trial.
          </h1>
          <p className="text-lg leading-8 text-slate-600">
            Pick the plan that fits your crew size. All plans include monthly billing and the same
            Stripe-hosted checkout flow.
          </p>
        </section>

        <PricingPlans />
      </div>
    </main>
  );
}
