"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  label?: string;
  mode?: "button" | "text";
  className?: string;
};

export function ManageBillingButton({
  label = "Manage Billing",
  mode = "button",
  className
}: Props) {
  const [loadingPortal, setLoadingPortal] = useState(false);

  const onManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const response = await fetch("/api/stripe/customer-portal", {
        method: "POST"
      });
      const json = await response.json();

      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to open billing portal.");
      }

      window.location.href = json.url;
    } catch (error) {
      // Provide a recovery path: if the portal call fails (Stripe outage,
      // misconfigured customer, etc.) point the user at support so they
      // aren't dead-ended on a toast they can't act on.
      toast.error(
        error instanceof Error ? error.message : "Unable to open billing portal.",
        {
          description:
            "If this keeps happening, email support@snapquote.us and we'll sort out your billing manually.",
          action: {
            label: "Email support",
            onClick: () => {
              window.location.href =
                "mailto:support@snapquote.us?subject=Billing%20portal%20issue";
            }
          },
          duration: 10000
        }
      );
    } finally {
      setLoadingPortal(false);
    }
  };

  if (mode === "text") {
    return (
      <button
        type="button"
        onClick={() => void onManageBilling()}
        disabled={loadingPortal}
        className={`text-sm text-primary transition-colors hover:text-primary/90 ${className ?? ""}`}
      >
        {loadingPortal ? "Opening..." : label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className ?? "w-full sm:w-auto"}
      onClick={() => void onManageBilling()}
      disabled={loadingPortal}
    >
      {loadingPortal ? "Opening..." : label}
    </Button>
  );
}
