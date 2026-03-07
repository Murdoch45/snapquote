"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UpgradeBannerProps = {
  warningAt90: boolean;
  canSend: boolean;
  quotesSentCount: number;
  limit: number | null;
  hardStopAt: number | null;
};

export function UpgradeBanner({
  warningAt90,
  canSend,
  quotesSentCount,
  limit,
  hardStopAt
}: UpgradeBannerProps) {
  if (!warningAt90 && canSend) return null;

  return (
    <Card className={canSend ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"}>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`mt-0.5 h-5 w-5 ${canSend ? "text-amber-600" : "text-red-600"}`}
          />
          <div>
            <p className="font-medium text-gray-900">
              {canSend ? "You are nearing your monthly quote limit." : "Quote sending is paused."}
            </p>
            <p className="text-sm text-gray-700">
              {limit === null
                ? "Business plan includes unlimited quote sends."
                : `Usage: ${quotesSentCount}/${limit} (hard stop at ${hardStopAt}).`}
            </p>
          </div>
        </div>
        <Button asChild variant={canSend ? "secondary" : "default"}>
          <Link href="/app/settings">Review plan</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
