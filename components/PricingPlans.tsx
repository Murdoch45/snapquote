"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type PlanKey = "solo" | "team" | "business";

const plans: Array<{
  key: PlanKey;
  name: string;
  price: string;
  description: string;
  cta: string;
  featured?: boolean;
  bullets: string[];
}> = [
  {
    key: "solo",
    name: "Solo",
    price: "$19.99",
    description: "For owner-operators who want faster lead response and AI-assisted quoting.",
    cta: "Start Solo Trial",
    bullets: ["1 seat", "Monthly billing", "14-day free trial"]
  },
  {
    key: "team",
    name: "Team",
    price: "$39.99",
    description: "For growing crews collaborating on leads, quotes, and customer follow-up.",
    cta: "Start Team Trial",
    featured: true,
    bullets: ["Up to 5 seats", "Monthly billing", "14-day free trial"]
  },
  {
    key: "business",
    name: "Business",
    price: "$79.99",
    description: "For established teams that need the full SnapQuote workflow at higher volume.",
    cta: "Start Business Trial",
    bullets: ["Expanded team access", "Monthly billing", "14-day free trial"]
  }
];

export function PricingPlans() {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);

  const onCheckout = async (plan: PlanKey) => {
    setLoadingPlan(plan);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ plan })
      });

      const json = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to start Stripe checkout.");
      }

      window.location.href = json.url;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to start your Stripe trial right now."
      );
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      {plans.map((plan) => (
        <article
          key={plan.key}
          className={`rounded-3xl border p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] ${
            plan.featured
              ? "border-cyan-300 bg-slate-950 text-white"
              : "border-slate-200 bg-white text-slate-900"
          }`}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <p
                className={`text-sm font-semibold uppercase tracking-[0.18em] ${
                  plan.featured ? "text-cyan-300" : "text-cyan-700"
                }`}
              >
                {plan.name}
              </p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-semibold">{plan.price}</span>
                <span className={plan.featured ? "text-slate-300" : "text-slate-500"}>/month</span>
              </div>
              <p className={plan.featured ? "text-slate-300" : "text-slate-600"}>
                {plan.description}
              </p>
            </div>

            <ul className="space-y-3">
              {plan.bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-2 text-sm">
                  <Check className={`h-4 w-4 ${plan.featured ? "text-cyan-300" : "text-cyan-700"}`} />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            <Button
              className={`w-full ${
                plan.featured
                  ? "bg-white text-slate-950 hover:bg-slate-100"
                  : ""
              }`}
              variant={plan.featured ? "default" : "outline"}
              disabled={loadingPlan !== null}
              onClick={() => onCheckout(plan.key)}
            >
              {loadingPlan === plan.key ? "Redirecting..." : plan.cta}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
