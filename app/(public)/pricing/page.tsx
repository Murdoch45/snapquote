import type { Metadata } from "next";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { ArrowRight, Check } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";

const manrope = Manrope({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SnapQuote | Pricing",
  description:
    "Simple pricing for contractors. Start free, scale as you grow."
};

type Plan = {
  name: string;
  price: string;
  cadence: string;
  description: string;
  highlighted?: boolean;
  features: string[];
  cta: { label: string; href: string };
};

const PLANS: Plan[] = [
  {
    name: "Solo",
    price: "$0",
    cadence: "Free forever",
    description: "Try SnapQuote with no commitment.",
    features: [
      "5 lead unlocks per month",
      "AI-powered estimates",
      "Public request page",
      "Customer-facing estimates",
      "Email support"
    ],
    cta: { label: "Get Started Free", href: "/signup" }
  },
  {
    name: "Team",
    price: "$49",
    cadence: "per month",
    description: "For growing crews who close more jobs.",
    highlighted: true,
    features: [
      "100 lead unlocks per month",
      "Up to 3 team seats",
      "Priority AI processing",
      "Real-time push notifications",
      "Estimate analytics",
      "Priority support"
    ],
    cta: { label: "Start Team Trial", href: "/signup" }
  },
  {
    name: "Business",
    price: "$149",
    cadence: "per month",
    description: "For established contractors running at volume.",
    features: [
      "500 lead unlocks per month",
      "Unlimited team seats",
      "Priority AI processing",
      "Real-time push notifications",
      "Estimate analytics",
      "Dedicated support"
    ],
    cta: { label: "Start Business Trial", href: "/signup" }
  }
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "What's a lead unlock?",
    a: "Every customer request that hits your link counts as a lead. You see the AI estimate up front. Spend a credit to unlock the customer's contact details and respond."
  },
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrade or downgrade from the Plan settings in the app. Changes take effect immediately."
  },
  {
    q: "What happens to unused credits?",
    a: "Plan credits reset each month. Bonus credits you purchase separately roll over and never expire."
  },
  {
    q: "Do you offer a free trial on paid plans?",
    a: "Team and Business plans include a 7-day free trial. You can cancel any time during the trial with no charge."
  },
  {
    q: "How does billing work?",
    a: "Billing is monthly via Stripe on the web or through the App Store on iOS. You can manage or cancel from inside the app."
  }
];

export default function PricingPage() {
  return (
    <main className={manrope.className}>
      <div className="min-h-screen bg-[#101320] text-white">
        <nav className="fixed top-0 z-50 w-full bg-transparent">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-8">
            <Link href="/" className="inline-flex items-center gap-3">
              <BrandLogo size="sm" showWordmark={false} iconClassName="text-white" />
              <span className="text-2xl font-bold tracking-tight text-white">
                SnapQuote
              </span>
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold text-white/80 hover:text-white"
            >
              Sign up
            </Link>
          </div>
        </nav>

        <section className="px-6 pb-16 pt-32 sm:px-8 sm:pt-40">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1] tracking-[-0.05em] text-white">
              Simple pricing.
              <br />
              Built for contractors.
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#c3c6d7]">
              Start free. Upgrade when you&apos;re ready to take on more jobs.
            </p>
          </div>
        </section>

        <section className="px-6 pb-24 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={
                  plan.highlighted
                    ? "relative flex flex-col rounded-3xl border border-primary/40 bg-[#1a2138] p-8 shadow-[0_30px_80px_-40px_rgba(37,99,235,0.6)]"
                    : "flex flex-col rounded-3xl border border-white/10 bg-[#161a2c] p-8"
                }
              >
                {plan.highlighted ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                    Most Popular
                  </span>
                ) : null}
                <h2 className="text-xl font-semibold text-white">{plan.name}</h2>
                <p className="mt-2 text-sm text-[#9aa1bd]">{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-5xl font-semibold tracking-tight text-white">
                    {plan.price}
                  </span>
                  <span className="text-sm text-[#9aa1bd]">{plan.cadence}</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-white/90">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className={
                    plan.highlighted
                      ? "mt-8 h-12 rounded-xl bg-primary text-base font-semibold text-white hover:bg-primary/90"
                      : "mt-8 h-12 rounded-xl border border-white/20 bg-transparent text-base font-semibold text-white hover:bg-white/5"
                  }
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  <Link href={plan.cta.href} className="inline-flex items-center gap-2">
                    {plan.cta.label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 pb-32 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
              Common questions
            </h2>
            <div className="mt-12 space-y-6">
              {FAQS.map((faq) => (
                <div
                  key={faq.q}
                  className="rounded-2xl border border-white/10 bg-[#161a2c] p-6"
                >
                  <h3 className="text-base font-semibold text-white">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-7 text-[#c3c6d7]">{faq.a}</p>
                </div>
              ))}
            </div>
            <div className="mt-12 text-center">
              <p className="text-sm text-[#9aa1bd]">
                Still have questions?{" "}
                <a
                  href="mailto:support@snapquote.us"
                  className="font-semibold text-primary hover:text-primary/90"
                >
                  Email us at support@snapquote.us
                </a>
              </p>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 px-6 py-10 sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-[#9aa1bd] sm:flex-row">
            <span>&copy; {new Date().getFullYear()} SnapQuote</span>
            <div className="flex gap-6">
              <Link href="/terms" className="hover:text-white">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
