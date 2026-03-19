"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ManageBillingButton() {
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

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full sm:w-auto"
      onClick={onManageBilling}
      disabled={loadingPortal}
    >
      {loadingPortal ? "Opening..." : "Manage Billing"}
    </Button>
  );
}
