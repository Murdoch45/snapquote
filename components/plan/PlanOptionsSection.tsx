"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Plan = "SOLO" | "TEAM" | "BUSINESS";

type PlanOption = {
  plan: Plan;
  name: string;
  price: string;
  credits: number;
  seats: number;
};

type Props = {
  currentPlan: Plan;
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
    price: "Free",
    credits: 5,
    seats: 1
  },
  {
    plan: "TEAM",
    name: "Team",
    price: "$19/mo",
    credits: 20,
    seats: 2
  },
  {
    plan: "BUSINESS",
    name: "Business",
    price: "$39/mo",
    credits: 100,
    seats: 5
  }
];

export function PlanOptionsSection({ currentPlan }: Props) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<PlanOption | null>(null);

  const openUpgrade = async (plan: Exclude<Plan, "SOLO">) => {
    setLoadingPlan(plan);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ plan: plan.toLowerCase() })
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
        method: "POST"
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
      <div className="grid gap-4 xl:grid-cols-3">
        {PLAN_OPTIONS.map((option) => {
          const isCurrent = option.plan === currentPlan;
          const isUpgrade = PLAN_ORDER[option.plan] > PLAN_ORDER[currentPlan];
          const isDowngrade = PLAN_ORDER[option.plan] < PLAN_ORDER[currentPlan];

          return (
            <Card
              key={option.plan}
              className={
                isCurrent
                  ? "border-2 border-[#2563EB] bg-[linear-gradient(135deg,#EFF6FF_0%,#ffffff_100%)] shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
                  : "border border-[#E5E7EB] bg-[#F8F9FC] shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
              }
            >
              <CardHeader className="space-y-3 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold text-[#111827]">
                      {option.name}
                    </CardTitle>
                    <p className="mt-1 text-sm text-[#6B7280]">{option.price}</p>
                  </div>
                  {isCurrent ? (
                    <Badge className="border-transparent bg-[#EFF6FF] px-3 py-1 text-[12px] font-semibold text-[#2563EB]">
                      Current Plan
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.05em] text-[#6B7280]">Credits</p>
                    <p className="mt-1 font-medium text-[#111827]">{option.credits}/month</p>
                  </div>
                  <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.05em] text-[#6B7280]">Users</p>
                    <p className="mt-1 font-medium text-[#111827]">{option.seats}</p>
                  </div>
                </div>

                {isCurrent ? null : isUpgrade ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={loadingPlan === option.plan}
                    onClick={() => {
                      if (option.plan !== "SOLO") {
                        void openUpgrade(option.plan);
                      }
                    }}
                  >
                    {loadingPlan === option.plan ? "Opening..." : `Upgrade to ${option.name}`}
                  </Button>
                ) : isDowngrade ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-2 border-[#2563EB] bg-transparent font-semibold text-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
                    disabled={loadingPortal}
                    onClick={() => setDowngradeTarget(option)}
                  >
                    {`Switch to ${option.name}`}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {downgradeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4">
          <div className="w-full max-w-md rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-[#111827]">Confirm plan change</h3>
              <p className="text-sm leading-6 text-[#6B7280]">
                You&apos;ll keep your current plan until your billing cycle ends, then switch to{" "}
                {downgradeTarget.name}. Your credits will adjust at that time. Continue?
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-2 border-[#E5E7EB] text-[#6B7280] hover:bg-[#F8F9FC] hover:text-[#111827]"
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
