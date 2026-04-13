"use client";

import { CreditCard, X } from "lucide-react";
import { useRouter } from "next/navigation";

type OutOfCreditsModalProps = {
  open: boolean;
  onClose: () => void;
};

export function OutOfCreditsModal({ open, onClose }: OutOfCreditsModalProps) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Close out of credits modal"
        className="absolute inset-0 bg-slate-950/45"
        onClick={onClose}
      />

      <div className="relative flex min-h-full items-center justify-center px-4 py-6">
        <div className="relative w-full max-w-[calc(100vw-2rem)] rounded-[14px] border border-border bg-card p-4 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.28)] sm:max-w-md sm:p-6">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
            <CreditCard className="h-6 w-6" />
          </div>

          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            You&apos;re out of credits
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            You need credits to unlock leads and view contact info. Buy more credits or
            upgrade your plan to keep going.
          </p>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/app/plan");
              }}
              className="inline-flex flex-1 items-center justify-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              Get More Credits
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex flex-1 items-center justify-center rounded-[10px] bg-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
