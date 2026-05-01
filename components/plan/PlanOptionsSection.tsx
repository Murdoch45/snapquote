"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

type Plan = "SOLO" | "TEAM" | "BUSINESS";
type BillingInterval = "monthly" | "annual";

type PlanOption = {
  plan: Plan;
  name: string;
  description: string;
  monthlyPrice: string;
  annualMonthlyPrice?: string;
  annualBillingLine?: string;
  credits: number;
  seats: number;
  highlights: string[];
};

type Props = {
  currentPlan: Plan;
  hasUsedTrial: boolean;
};

const PLAN_ORDER: Record<Plan, number> = {
  SOLO: 0,
  TEAM: 1,
  BUSINESS: 2
};

const PLAN_OPTIONS: PlanOption[] = [
  {
    plan: "SOLO",
    name: "Solo",
    description: "For owner-operators getting started with SnapQuote.",
    monthlyPrice: "Free",
    credits: 5,
    seats: 1,
    highlights: ["5 monthly credits", "1 team member", "Core estimating workflow"]
  },
  {
    plan: "TEAM",
    name: "Team",
    description: "For growing crews that need faster estimating and shared access.",
    monthlyPrice: "$19.99/mo",
    annualMonthlyPrice: "$15.99/mo",
    annualBillingLine: "billed $191.99/yr",
    credits: 20,
    seats: 2,
    highlights: ["20 monthly credits", "2 team members", "Shared workspace"]
  },
  {
    plan: "BUSINESS",
    name: "Business",
    description: "For high-volume contractors who want the most leverage.",
    monthlyPrice: "$39.99/mo",
    annualMonthlyPrice: "$33.99/mo",
    annualBillingLine: "billed $383.99/yr",
    credits: 100,
    seats: 5,
    highlights: ["100 monthly credits", "5 team members", "Best for repeat lead volume"]
  }
];

const DEFAULT_INTERVALS: Record<Exclude<Plan, "SOLO">, BillingInterval> = {
  TEAM: "annual",
  BUSINESS: "annual"
};

function BillingToggle({
  value,
  onChange
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[#DBEAFE] bg-[#F8FAFF] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      {(["monthly", "annual"] as BillingInterval[]).map((option) => {
        const active = value === option;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={
              active
                ? "rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-[0_6px_18px_rgba(37,99,235,0.16)]"
                : "rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            {option === "monthly" ? "Monthly" : "Annual"}
          </button>
        );
      })}
    </div>
  );
}

export function PlanOptionsSection({ currentPlan, hasUsedTrial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasShownToastRef = useRef(false);
  const [billingIntervals, setBillingIntervals] = useState(DEFAULT_INTERVALS);
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<PlanOption | null>(null);

  useEffect(() => {
    if (searchParams.get("scroll") === "plan-options") {
      const el = document.getElementById("plan-options");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const updated = searchParams.get("updated");
    const change = searchParams.get("change");
    if (hasShownToastRef.current) return;

    if (updated === "1") {
      hasShownToastRef.current = true;
      toast.success("Plan upgraded successfully!");
      router.replace("/app/plan");
      // router.replace alone strips the query param but doesn't re-fetch the
      // Server Component data, so the "Current Plan" card still shows the
      // pre-upgrade tier until manual reload. Force a refetch so the UI
      // reflects the post-upgrade state immediately. (May 1 audit fix.)
      router.refresh();
      return;
    }

    if (change === "scheduled") {
      hasShownToastRef.current = true;
      toast.success("Your plan change has been scheduled.");
      router.replace("/app/plan");
      router.refresh();
    }
  }, [router, searchParams]);

  const openUpgrade = async (plan: Exclude<Plan, "SOLO">, billingInterval: BillingInterval) => {
    setLoadingPlan(plan);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ plan: plan.toLowerCase(), billingInterval })
      });
      const json = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to start checkout.");
      }

      window.location.href = json.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start checkout.");
      setLoadingPlan(null);
    }
  };

  const openPortal = async () => {
    setLoadingPortal(true);

    try {
      const response = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ change: "scheduled" })
      });
      const json = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to open billing portal.");
      }

      window.location.href = json.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing portal.");
      setLoadingPortal(false);
    }
  };

  return (
    <>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 xl:grid xl:snap-none xl:grid-cols-3 xl:grid-rows-[auto_auto_1fr_auto] xl:gap-5 xl:overflow-visible xl:pb-0">
        {PLAN_OPTIONS.map((option) => {
          const isCurrent = option.plan === currentPlan;
          const isUpgrade = PLAN_ORDER[option.plan] > PLAN_ORDER[currentPlan];
          const isDowngrade = PLAN_ORDER[option.plan] < PLAN_ORDER[currentPlan];
          const interval =
            option.plan === "SOLO" ? "monthly" : billingIntervals[option.plan as "TEAM" | "BUSINESS"];
          const showAnnualPricing = option.plan !== "SOLO" && interval === "annual";
          const displayPrice = showAnnualPricing
            ? option.annualMonthlyPrice ?? option.monthlyPrice
            : option.monthlyPrice;

          return (
            <Card
              key={option.plan}
              className={
                isCurrent
                  ? "relative flex w-[75vw] shrink-0 snap-start flex-col overflow-hidden rounded-[14px] border border-primary/40 bg-card shadow-[0_20px_40px_rgba(37,99,235,0.12),0_2px_8px_rgba(0,0,0,0.06)] xl:w-auto xl:min-w-0 xl:shrink xl:snap-align-none xl:row-span-4 xl:grid xl:grid-rows-subgrid"
                  : "relative flex w-[75vw] shrink-0 snap-start flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_16px_30px_rgba(15,23,42,0.06),0_2px_8px_rgba(0,0,0,0.04)] xl:w-auto xl:min-w-0 xl:shrink xl:snap-align-none xl:row-span-4 xl:grid xl:grid-rows-subgrid"
              }
            >
              <div
                className={
                  isCurrent
                    ? "pointer-events-none absolute inset-x-6 top-0 h-20 rounded-b-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_70%)] blur-2xl"
                    : "pointer-events-none absolute inset-x-10 top-0 h-16 rounded-b-full bg-[radial-gradient(circle,rgba(148,163,184,0.12),transparent_70%)] blur-2xl"
                }
              />

              <CardHeader className="relative flex flex-col space-y-1.5 px-3 pt-3 pb-0.5 xl:space-y-2.5 xl:px-4 xl:pt-4 xl:pb-1">
                <div className="flex min-h-[48px] items-start justify-between gap-2 xl:min-h-[56px] xl:gap-2.5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg font-semibold text-foreground">
                        {option.name}
                      </CardTitle>
                      {isCurrent ? (
                        <Badge className="border-transparent bg-primary px-3 py-1 text-[12px] font-semibold text-white">
                          Current Plan
                        </Badge>
                      ) : null}
                      {showAnnualPricing ? (
                        <Badge className="border-transparent bg-accent px-3 py-1 text-[12px] font-semibold text-primary">
                          Save 17%
                        </Badge>
                      ) : null}
                    </div>
                    <p className="max-w-[26ch] text-xs leading-5 text-muted-foreground xl:text-sm xl:leading-6">
                      {option.description}
                    </p>
                  </div>

                  {option.plan !== "SOLO" ? (
                    <BillingToggle
                      value={interval}
                      onChange={(nextValue) =>
                        setBillingIntervals((prev) => ({
                          ...prev,
                          [option.plan]: nextValue
                        }))
                      }
                    />
                  ) : (
                    <div className="rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      Free
                    </div>
                  )}
                </div>

              </CardHeader>

              <div className="mx-3 rounded-[14px] border border-border bg-card/80 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur xl:mx-4 xl:px-4 xl:py-2.5">
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground xl:text-4xl">
                    {displayPrice}
                  </p>
                </div>
                <p className="mt-1 min-h-[20px] text-sm text-muted-foreground">
                  {showAnnualPricing && option.annualBillingLine ? option.annualBillingLine : " "}
                </p>
              </div>

              <div className="relative flex flex-1 flex-col px-3 xl:px-4">
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 xl:mt-2 xl:gap-2">
                  <div className="rounded-[14px] border border-border bg-card px-2.5 py-2 xl:px-3 xl:py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Credits
                    </p>
                    <p className="mt-1.5 text-lg font-semibold text-foreground">
                      {option.credits}
                      <span className="ml-1 text-sm font-medium text-muted-foreground">/ month</span>
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-border bg-card px-2.5 py-2 xl:px-3 xl:py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Users
                    </p>
                    <p className="mt-1.5 text-lg font-semibold text-foreground">{option.seats}</p>
                  </div>
                </div>

                <div className="mt-1.5 space-y-1.5 rounded-[14px] border border-border bg-card px-2.5 py-2 xl:mt-2 xl:space-y-2 xl:px-3 xl:py-3">
                  {option.highlights.map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-xs text-foreground xl:gap-2 xl:text-sm">
                      <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent xl:h-5 xl:w-5">
                        <Check className="h-3 w-3 text-primary xl:h-3.5 xl:w-3.5" />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-3 pb-2 pt-1.5 xl:px-4 xl:pb-3 xl:pt-2 xl:self-end">
                {isCurrent ? (
                  <Button
                    type="button"
                    disabled
                    className="h-11 w-full rounded-[10px] bg-foreground text-sm font-semibold text-background opacity-100 hover:bg-foreground"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Current Plan
                  </Button>
                ) : isUpgrade ? (
                  <Button
                    type="button"
                    className="h-11 w-full rounded-[10px] bg-primary text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)] hover:bg-primary/90"
                    disabled={loadingPlan === option.plan}
                    onClick={() => {
                      if (option.plan !== "SOLO") {
                        void openUpgrade(
                          option.plan,
                          billingIntervals[option.plan as "TEAM" | "BUSINESS"]
                        );
                      }
                    }}
                  >
                    {loadingPlan === option.plan
                      ? "Opening..."
                      : hasUsedTrial
                        ? `Switch to ${option.name}`
                        : "Start Free Trial"}
                    {loadingPlan === option.plan ? null : <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                ) : isDowngrade ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full rounded-[10px] border border-primary/40 bg-card text-sm font-semibold text-primary shadow-[0_8px_20px_rgba(37,99,235,0.08)] hover:bg-accent hover:text-primary"
                    disabled={loadingPortal}
                    onClick={() => setDowngradeTarget(option)}
                  >
                    {`Switch to ${option.name}`}
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {downgradeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4">
          <div className="w-full max-w-md rounded-[14px] border border-border bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground">Confirm plan change</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                You&apos;ll keep your current plan until your billing cycle ends, then switch to{" "}
                {downgradeTarget.name}. Your credits will adjust at that time. Continue?
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-2 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setDowngradeTarget(null)}
                disabled={loadingPortal}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void openPortal()} disabled={loadingPortal}>
                {loadingPortal ? "Opening..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
