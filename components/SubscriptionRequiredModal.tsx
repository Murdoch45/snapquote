"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  // "contractor" drives the authenticated in-app surfaces (QuoteComposer).
  // "customer" is used on the public lead form, where the visitor is the
  // customer — showing them billing CTAs aimed at the contractor is confusing,
  // so we swap copy and hide the Update Billing link.
  variant?: "contractor" | "customer";
};

export function SubscriptionRequiredModal({ open, onClose, variant = "contractor" }: Props) {
  if (!open) return null;

  const isCustomer = variant === "customer";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-required-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
    >
      <div className="w-full max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-md sm:p-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            {isCustomer ? "Not Accepting Requests" : "Billing Required"}
          </p>
          <h2 id="subscription-required-title" className="text-2xl font-semibold text-foreground">
            {isCustomer
              ? "This contractor isn't accepting new requests right now."
              : "Your SnapQuote subscription is inactive."}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {isCustomer
              ? "Please reach out to them directly for an estimate."
              : "Update billing to continue generating estimates."}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {isCustomer ? null : (
            <Button asChild className="flex-1">
              <Link href="/app/plan">Update Billing</Link>
            </Button>
          )}
          <Button
            type="button"
            variant={isCustomer ? "default" : "outline"}
            className="flex-1"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
