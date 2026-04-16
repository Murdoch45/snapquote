import Link from "next/link";
import { ArrowRight, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AnalyticsEmptyState() {
  return (
    <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
          <LineChart className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            No analytics to show yet
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Once customers start submitting requests through your SnapQuote
            link, your leads, estimates, and acceptance trends will appear
            here. Share your link to start receiving leads.
          </p>
        </div>
        <Button asChild className="mt-2">
          <Link href="/dashboard/my-link">
            Go to My Link
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
