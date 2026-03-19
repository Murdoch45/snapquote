"use client";

import { Button } from "@/components/ui/button";

type Provider = "google" | "apple";

type OAuthButtonsProps = {
  googleLabel: string;
  appleLabel: string;
  loadingProvider: Provider | null;
  onProviderClick: (provider: Provider) => void;
};

export function OAuthButtons({
  googleLabel,
  appleLabel,
  loadingProvider,
  onProviderClick
}: OAuthButtonsProps) {
  const disabled = loadingProvider !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => onProviderClick("google")}
          disabled={disabled}
          className="h-11 w-full rounded-xl border-slate-300 text-slate-700 hover:text-slate-900"
        >
          {loadingProvider === "google" ? "Redirecting..." : googleLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onProviderClick("apple")}
          disabled={disabled}
          className="h-11 w-full rounded-xl border-slate-300 text-slate-700 hover:text-slate-900"
        >
          {loadingProvider === "apple" ? "Redirecting..." : appleLabel}
        </Button>
      </div>
    </div>
  );
}
