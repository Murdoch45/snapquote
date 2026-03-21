"use client";

import { useState } from "react";
import { Check, CreditCard, Sparkles, Users } from "lucide-react";
import { CreditPackCheckoutButton } from "@/components/plan/CreditPackCheckoutButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PlanKey = "solo" | "team" | "business";

type PricingPlansProps = {
  currentPlan: string;
  hasUsedTrial: boolean;
  isAuthenticated: boolean;
};

const PLAN_ORDER: Record<PlanKey, number> = {
  solo: 0,
  team: 1,
  business: 2
};

const plans: Array<{
  key: PlanKey;
  name: string;
  price: string;
  description: string;
  monthlyCredits: number;
  teamMembers: number;
  featured?: boolean;
}> = [
  {
    key: "solo",
    name: "Solo",
    price: "Free",
    description: "For owner-operators who want a simple way to review leads and quote faster.",
    monthlyCredits: 5,
    teamMembers: 1
  },
  {
    key: "team",
    name: "Team",
    price: "$19",
    description: "For small crews handling steady inbound demand and sharing lead follow-up.",
    monthlyCredits: 20,
    teamMembers: 2,
    featured: true
  },
  {
    key: "business",
    name: "Business",
    price: "$39",
    description: "For established contractors who need more unlocks and room for the full team.",
    monthlyCredits: 100,
    teamMembers: 5
  }
];

const creditPacks = [
  { pack: "10" as const, label: "10 credits", price: "$10" },
  { pack: "50" as const, label: "50 credits", price: "$40" },
  { pack: "100" as const, label: "100 credits", price: "$70" }
];

const faqItems = [
  {
    title: "What happens when I run out of credits?",
    body: "You can still browse leads, photos, job details, quote tools, and AI estimate context, but you will not be able to unlock more customer contact info until you reset or buy more credits."
  },
  {
    title: "When do credits reset?",
    body: "Monthly credits reset on your billing anniversary. Solo accounts reset on their monthly anniversary too."
  },
  {
    title: "Do purchased credits expire?",
    body: "No. Bonus credits from credit packs never expire and can be used on any plan."
  },
  {
    title: "Can I change plans later?",
    body: "Yes. You can upgrade anytime, and downgrades can be managed from billing when needed."
  }
];

function getPlanFeatures(teamMembers: number): string[] {
  return [
    "View all leads and job details",
    "Unlock customer contact info for 1 credit per lead",
    "Send quotes",
    "Access to AI estimator",
    `${teamMembers} team member${teamMembers === 1 ? "" : "s"} allowed`
  ];
}

export function PricingPlans({
  currentPlan,
  hasUsedTrial,
  isAuthenticated
}: PricingPlansProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const currentOrder = currentPlan in PLAN_ORDER ? PLAN_ORDER[currentPlan as PlanKey] : -1;

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

  const goToAuth = (href: string) => {
    window.location.href = href;
  };

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const features = getPlanFeatures(plan.teamMembers);
          const paidPlanKey = plan.key === "solo" ? null : plan.key;
          const isCurrentPlan = plan.key === currentPlan;
          const isUpgrade = currentOrder >= 0 && PLAN_ORDER[plan.key] > currentOrder;
          const isDowngrade = currentOrder >= 0 && PLAN_ORDER[plan.key] < currentOrder;
          const cardClassName = plan.featured
            ? "border-cyan-300 bg-slate-950 text-white shadow-[0_25px_80px_-40px_rgba(6,182,212,0.55)]"
            : "border-slate-200 bg-white text-slate-900 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.3)]";
          const mutedClassName = plan.featured ? "text-slate-300" : "text-slate-600";
          const accentClassName = plan.featured ? "text-cyan-300" : "text-cyan-700";
          const buttonClassName = plan.featured
            ? "bg-white text-slate-950 hover:bg-slate-100"
            : "";

          let buttonLabel = "";
          let buttonDisabled = false;
          let onClick: (() => void) | undefined;

          if (plan.key === "solo") {
            if (isCurrentPlan) {
              buttonLabel = "Current Plan";
              buttonDisabled = true;
            } else if (isDowngrade) {
              buttonLabel = loadingPortal ? "Loading..." : "Manage in Billing";
              buttonDisabled = loadingPortal;
              onClick = () => void handlePortal();
            } else {
              buttonLabel = "Start Free Trial";
              onClick = () => goToAuth(isAuthenticated ? "/app" : "/signup");
            }
          } else if (isCurrentPlan) {
            buttonLabel = "Current Plan";
            buttonDisabled = true;
          } else if (isDowngrade) {
            buttonLabel = loadingPortal ? "Loading..." : "Manage in Billing";
            buttonDisabled = loadingPortal;
            onClick = () => void handlePortal();
          } else if (isUpgrade) {
            buttonLabel = loadingPlan === plan.key ? "Loading..." : "Upgrade";
            buttonDisabled = loadingPlan === plan.key;
            onClick = () => {
              if (paidPlanKey) {
                void handleUpgrade(paidPlanKey);
              }
            };
          } else {
            buttonLabel =
              loadingPlan === plan.key
                ? "Loading..."
                : hasUsedTrial
                  ? "Choose Plan"
                  : "Start 14-day Trial";
            buttonDisabled = loadingPlan === plan.key;
            onClick = () => {
              if (paidPlanKey) {
                void handleUpgrade(paidPlanKey);
              }
            };
          }

          return (
            <Card key={plan.key} className={`rounded-3xl border p-1 ${cardClassName}`}>
              <CardHeader className="space-y-4 p-6 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${accentClassName}`}>
                      {plan.name}
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-4xl font-semibold">{plan.price}</span>
                      <span className={mutedClassName}>/month</span>
                    </div>
                  </div>
                  {plan.featured ? <Badge variant="secondary">Most Popular</Badge> : null}
                </div>

                <CardDescription className={`text-sm leading-6 ${mutedClassName}`}>
                  {plan.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 p-6 pt-3">
                <div
                  className={`rounded-2xl border px-4 py-4 ${
                    plan.featured
                      ? "border-cyan-400/40 bg-white/5"
                      : "border-cyan-100 bg-cyan-50/70"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className={`h-4 w-4 ${accentClassName}`} />
                    <span className={plan.featured ? "text-white" : "text-slate-900"}>
                      {plan.monthlyCredits} monthly lead credits
                    </span>
                  </div>
                </div>

                <ul className="space-y-3">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm leading-6">
                      <Check className={`mt-1 h-4 w-4 shrink-0 ${accentClassName}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${buttonClassName}`}
                  variant={plan.featured ? "default" : "outline"}
                  disabled={buttonDisabled}
                  onClick={onClick}
                >
                  {buttonLabel}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_25px_80px_-50px_rgba(15,23,42,0.35)] md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
              <CreditCard className="h-4 w-4" />
              Credit Packs
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              Buy additional credits anytime
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Buy additional credits anytime. Never expire and work on any plan.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {creditPacks.map((pack) => (
            <Card key={pack.pack} className="rounded-2xl border-slate-200">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl">{pack.label}</CardTitle>
                <CardDescription>One-time purchase</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-3xl font-semibold text-slate-950">{pack.price}</div>
                {isAuthenticated ? (
                  <CreditPackCheckoutButton pack={pack.pack} />
                ) : (
                  <Button type="button" variant="outline" onClick={() => goToAuth("/login")}>
                    Sign In to Buy
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_25px_80px_-50px_rgba(15,23,42,0.55)] md:p-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <Users className="h-4 w-4" />
            How Credits Work
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Simple rules, no surprises</h2>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {faqItems.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
