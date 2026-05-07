"use client";

import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Shown to a customer (visitor on the public lead form) when the contractor's
// org is on Solo and has been inactive for 30 days. The visitor sees no
// billing-vocabulary copy — that's a contractor-side concern they shouldn't be
// exposed to. SnapQuote is a free app with Solo as the default tier; there is
// no "subscription required" state for any authenticated user, so this modal
// has no contractor-facing variant. (Cleanup landed in PR 1 of the 2026-05-07
// Plan-page architecture overhaul; see Pending Work for the full plan.)
export function ContractorUnavailableModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contractor-unavailable-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
    >
      <div className="w-full max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-md sm:p-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Not Accepting Requests
          </p>
          <h2 id="contractor-unavailable-title" className="text-2xl font-semibold text-foreground">
            This contractor isn&apos;t accepting new requests right now.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Please reach out to them directly for an estimate.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
