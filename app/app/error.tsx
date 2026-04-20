"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Explicit capture — more robust than relying on captureConsoleIntegration,
    // and attaches the full error object (message + stack) with the segment
    // digest as a tag so Sentry entries are linkable to user-visible
    // references.
    Sentry.captureException(error, {
      tags: { segment: "app", digest: error.digest ?? "none" }
    });
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Try refreshing the page or contact support if the problem persists.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground/70">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
