"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function QuoteError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Public quote error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load this estimate right now. Please try again or contact the contractor directly.
        </p>
        <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center justify-center rounded-[10px] bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-sm font-semibold text-primary hover:text-primary/90"
          >
            Go to SnapQuote
          </Link>
        </div>
      </div>
    </main>
  );
}
