"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrganizationSubscriptionStatus } from "@/lib/subscription";

type Props = {
  subscription: OrganizationSubscriptionStatus;
};

function formatPlan(plan: string | null, active: boolean): string {
  if (!active || !plan) return "None";
  return `${plan.slice(0, 1)}${plan.slice(1).toLowerCase()}`;
}

function formatStatus(status: string | null): string {
  if (status === "active") return "Active";
  if (status === "trialing") return "Trial";
  return "Inactive";
}

function formatTrialEndDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function SubscriptionStatusCard({ subscription }: Props) {
  const inactive = !subscription.active;
  const statusLabel = formatStatus(subscription.status);
  const planLabel = formatPlan(subscription.plan, subscription.active);
  const trialEndDate = formatTrialEndDate(subscription.trialEndDate);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const onManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const response = await fetch("/api/stripe/customer-portal", {
        method: "POST"
      });
      const json = await response.json();

      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to open billing portal.");
      }

      window.location.href = json.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing portal.");
    } finally {
      setLoadingPortal(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle>Subscription Status</CardTitle>
          <CardDescription>Current plan and billing access for your workspace.</CardDescription>
        </div>
        <Badge
          variant="muted"
          className={
            inactive
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }
        >
          {statusLabel}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Current Plan
            </p>
            <p className="text-lg font-semibold text-gray-900">{planLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Subscription Status
            </p>
            <p className="text-lg font-semibold text-gray-900">{statusLabel}</p>
          </div>
          {subscription.status === "trialing" && trialEndDate ? (
            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Trial End Date
              </p>
              <p className="text-sm font-medium text-gray-800">Trial ends: {trialEndDate}</p>
            </div>
          ) : null}
          {inactive ? (
            <div className="space-y-1 sm:col-span-2">
              <p className="text-sm text-red-700">
                Your subscription is inactive. Upgrade to continue generating estimates.
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto">
          {inactive ? (
            <Button asChild className="w-full md:w-auto">
              <Link href="/pricing">Upgrade Plan</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={inactive ? "outline" : "default"}
            className="w-full md:w-auto"
            onClick={onManageBilling}
            disabled={loadingPortal}
          >
            {loadingPortal ? "Opening..." : "Manage Billing"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
