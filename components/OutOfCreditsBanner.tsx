import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { OrgPlan } from "@/lib/types";

type OutOfCreditsBannerProps = {
  plan: OrgPlan;
  monthlyCredits: number;
  bonusCredits: number;
};

/**
 * Passive heads-up shown at the top of authenticated /app pages when the
 * org has exhausted BOTH monthly and bonus credits. Renders nothing when
 * either pool still has credits — partial-balance orgs see no banner so
 * the surface stays calm during normal use.
 *
 * Coexists with `OutOfCreditsModal`: this banner is the at-rest heads-up,
 * the modal is the at-action interrupter that fires when a contractor
 * clicks Unlock with no credits. Both pointing at the same plan/credit
 * pages keeps the recovery path single.
 */
export function OutOfCreditsBanner({
  plan,
  monthlyCredits,
  bonusCredits
}: OutOfCreditsBannerProps) {
  if (monthlyCredits > 0 || bonusCredits > 0) return null;

  const isBusiness = plan === "BUSINESS";
  const ctaLabel = isBusiness ? "Buy more credits" : "Upgrade";
  // BUSINESS orgs are already on the top tier — sending them to the plan
  // page wouldn't unblock them. Route to the credit-pack purchase flow
  // instead. SOLO/TEAM orgs route to /app/plan where they can upgrade
  // and pick up the next tier's monthly credit allowance.
  const ctaHref = isBusiness ? "/app/credits" : "/app/plan";

  return (
    <Card className="border-red-300 bg-red-50">
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-foreground">You&rsquo;re out of credits.</p>
            <p className="text-sm text-foreground/80">
              You need credits to unlock new leads and send estimates.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
