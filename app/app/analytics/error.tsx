"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Scoped error boundary for the Analytics route. Replaces the generic
// app/app/error.tsx for this segment so an RPC failure (timeout, auth
// rejection, unexpected shape) shows a contextual message with retry
// inside the AppShell layout instead of the full-page error UI.
export default function AnalyticsError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Analytics error boundary caught:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
      <Card
        role="alert"
        className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]"
      >
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              We couldn&apos;t load your analytics
            </h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Something went wrong while aggregating your numbers. Try
              again, and if this keeps happening reach out to
              support@snapquote.us.
            </p>
          </div>
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
