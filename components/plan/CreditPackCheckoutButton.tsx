"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  pack: "10" | "50" | "100";
  successPath?: string;
  cancelPath?: string;
  children?: ReactNode;
};

export function CreditPackCheckoutButton({
  pack,
  successPath,
  cancelPath,
  children
}: Props) {
  const [loading, setLoading] = useState(false);

  const onCheckout = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/stripe/credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ pack, successPath, cancelPath })
      });
      const json = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !json.url) {
        throw new Error(json.error || "Unable to open credit checkout.");
      }

      window.location.href = json.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open credit checkout.");
      setLoading(false);
    }
  };

  if (!children) {
    return (
      <Button
        type="button"
        className="px-6 py-2 font-semibold"
        onClick={() => void onCheckout()}
        disabled={loading}
      >
        {loading ? "Opening..." : "Buy"}
      </Button>
    );
  }

  return (
    <button
      type="button"
      className="group block h-full w-full cursor-pointer rounded-[14px] border border-[#E5E7EB] bg-[#F8F9FC] p-6 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-2 hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:shadow-[0_4px_20px_rgba(37,99,235,0.15)]"
      onClick={() => void onCheckout()}
      disabled={loading}
    >
      <div className="flex h-full flex-col">
        {children}
        <div className="mt-4 flex justify-end">
          <span className="text-sm font-medium text-[#2563EB] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {loading ? "Opening..." : "Purchase ->"}
          </span>
        </div>
      </div>
    </button>
  );
}
