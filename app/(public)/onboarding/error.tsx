"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function OnboardingError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Onboarding error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load the onboarding page. Please try again or contact support if the
          problem persists.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
