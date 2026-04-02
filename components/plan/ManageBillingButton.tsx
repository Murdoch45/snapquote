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
      toast.error(error instanceof Error ? error.message : "Unable to open billing portal.");
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
        className={`text-sm text-[#2563EB] transition-colors hover:text-[#1D4ED8] ${className ?? ""}`}
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
