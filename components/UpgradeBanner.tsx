"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OrgPlan } from "@/lib/types";

type UpgradeBannerProps = {
  warningAt90: boolean;
  canSend: boolean;
  quotesSentCount: number;
  limit: number | null;
  plan: OrgPlan;
  /**
   * First-of-month ISO date string (UTC) for the usage window the banner
   * is reporting on — e.g. "2026-05-01" for May. Used to compute the
   * next-reset label shown when sending is paused.
   */
  month: string;
};

function planLabel(plan: OrgPlan): string {
  if (plan === "TEAM") return "Team";
  if (plan === "BUSINESS") return "Business";
  return "Solo";
}

/**
 * Format the next monthly reset as "Month D" (e.g. "June 1").
 *
 * `month` is the first day of the CURRENT usage month in UTC (the value
 * `getMonthlyUsage` writes to `UsageState.month`). JavaScript's Date.UTC
 * uses a 0-indexed month argument, while the ISO month component is
 * 1-indexed — so passing the parsed month value unchanged jumps us
 * exactly one month forward, which is the reset point.
 */
function nextResetLabel(month: string): string {
  const parts = month.split("-");
  const year = Number(parts[0]);
  const oneBasedMonth = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(oneBasedMonth)) return "next month";
  const nextResetUtc = new Date(Date.UTC(year, oneBasedMonth, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(nextResetUtc);
}

export function UpgradeBanner({
  warningAt90,
  canSend,
  quotesSentCount,
  limit,
  plan,
  month
}: UpgradeBannerProps) {
  // Either the contractor is paused or within 10% of the cap — anything
  // else hides the banner entirely. `limit === null` would only happen
  // on a future unlimited tier; defensively bail then too.
  if ((!warningAt90 && canSend) || limit === null) return null;

  const planName = planLabel(plan);
  const resetLabel = nextResetLabel(month);
  const remaining = Math.max(0, limit - quotesSentCount);

  return (
    <Card className={canSend ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"}>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`mt-0.5 h-5 w-5 ${canSend ? "text-amber-600" : "text-red-600"}`}
          />
          <div>
            {canSend ? (
              <>
                <p className="font-medium text-foreground">
                  You&rsquo;re almost out of estimates this month
                </p>
                <p className="text-sm text-foreground/80">
                  {remaining === 0
                    ? `No estimates left on your ${planName} plan this month.`
                    : `You have ${remaining} ${remaining === 1 ? "estimate" : "estimates"} left on your ${planName} plan.`}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">
                  You&rsquo;ve used all your estimates this month
                </p>
                <p className="text-sm text-foreground/80">
                  Your {planName} plan covers {limit} {limit === 1 ? "estimate" : "estimates"} a month. Upgrade to keep sending, or your monthly limit resets on {resetLabel}.
                </p>
              </>
            )}
          </div>
        </div>
        <Button asChild variant={canSend ? "secondary" : "default"}>
          <Link href="/app/plan">Upgrade plan</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
