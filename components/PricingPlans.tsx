"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type PlanKey = "solo" | "team" | "business";

const plans: Array<{
  key: PlanKey;
  name: string;
  price: string;
  description: string;
  featured?: boolean;
  bullets: string[];
}> = [
  {
    key: "solo",
    name: "Solo",
    price: "Free",
    description: "For solo contractors getting started",
    bullets: ["1 user", "50 quotes per month"]
  },
  {
    key: "team",
    name: "Team",
    price: "$19",
    description: "For small crews handling steady job flow",
    featured: true,
    bullets: ["Up to 5 users", "150 quotes per month"]
  },
  {
    key: "business",
    name: "Business",
    price: "$39",
    description: "For established teams at full volume",
    bullets: ["Up to 10 users", "Unlimited quotes"]
  }
];

type PricingPlansProps = {
  currentPlan: string;
  hasUsedTrial: boolean;
};

export function PricingPlans({ currentPlan, hasUsedTrial }: PricingPlansProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const handleUpgrade = async (planKey: Exclude<PlanKey, "solo">) => {
    setLoadingPlan(planKey);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ plan: planKey })
      });

      const json = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to start checkout.");
      }

      window.location.href = json.url;
    } catch (error) {
      console.error("pricing checkout failed:", error);
      setLoadingPlan(null);
    }
  };

  const handlePortal = async () => {
    setLoadingPortal(true);

    try {
      const response = await fetch("/api/stripe/customer-portal", {
        method: "POST"
      });

      const json = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to open billing portal.");
      }

      window.location.href = json.url;
    } catch (error) {
      console.error("pricing portal failed:", error);
      setLoadingPortal(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      {plans.map((plan) => {
        const isCurrentPlan = plan.key === currentPlan;
        const cardClassName = `rounded-3xl border p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] ${
          plan.featured
            ? "border-cyan-300 bg-slate-950 text-white"
            : "border-slate-200 bg-white text-slate-900"
        }`;
        const buttonClassName = `w-full ${plan.featured ? "bg-white text-slate-950 hover:bg-slate-100" : ""}`;

        if (plan.key === "solo") {
          return (
            <article key={plan.key} className={cardClassName}>
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
                    <span className={plan.featured ? "text-slate-300" : "text-slate-500"}>
                      /month
                    </span>
                  </div>
                  <p className={plan.featured ? "text-slate-300" : "text-slate-600"}>
                    {plan.description}
                  </p>
                </div>

                <ul className="space-y-3">
                  {plan.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2 text-sm">
                      <Check
                        className={`h-4 w-4 ${plan.featured ? "text-cyan-300" : "text-cyan-700"}`}
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={buttonClassName}
                  variant={plan.featured ? "default" : "outline"}
                  disabled={isCurrentPlan || loadingPortal}
                  onClick={isCurrentPlan ? undefined : () => void handlePortal()}
                >
                  {isCurrentPlan ? "Current Plan" : loadingPortal ? "Loading..." : "Choose Plan"}
                </Button>
              </div>
            </article>
          );
        }

        const paidPlanKey: Exclude<PlanKey, "solo"> = plan.key;
        const paidButtonLabel = isCurrentPlan
          ? "Current Plan"
          : hasUsedTrial
            ? "Choose Plan"
            : "Start Free Trial";

        return (
          <article key={plan.key} className={cardClassName}>
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
                  <span className={plan.featured ? "text-slate-300" : "text-slate-500"}>
                    /month
                  </span>
                </div>
                <p className={plan.featured ? "text-slate-300" : "text-slate-600"}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3">
                {plan.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-center gap-2 text-sm">
                    <Check
                      className={`h-4 w-4 ${plan.featured ? "text-cyan-300" : "text-cyan-700"}`}
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={buttonClassName}
                variant={plan.featured ? "default" : "outline"}
                disabled={isCurrentPlan || loadingPlan === plan.key}
                onClick={() => void handleUpgrade(paidPlanKey)}
              >
                {loadingPlan === plan.key ? "Loading..." : paidButtonLabel}
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
