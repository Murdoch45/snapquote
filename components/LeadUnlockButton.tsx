"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { OutOfCreditsModal } from "@/components/OutOfCreditsModal";
import { Button, type ButtonProps } from "@/components/ui/button";

type Props = {
  leadId: string;
  onUnlocked?: (args: { alreadyUnlocked: boolean }) => void;
} & Omit<ButtonProps, "onClick">;

export function LeadUnlockButton({ leadId, onUnlocked, children, ...props }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false);

  const onUnlock = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/app/leads/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ leadId })
      });

      const json = (await response.json()) as {
        error?: string;
        ok?: boolean;
        alreadyUnlocked?: boolean;
        remainingCredits?: number;
      };

      if (!response.ok) {
        if (json.error === "no_credits") {
          setShowOutOfCreditsModal(true);
          return;
        }

        throw new Error(json.error || "Unable to unlock lead.");
      }

      onUnlocked?.({ alreadyUnlocked: json.alreadyUnlocked === true });
      toast.success(json.alreadyUnlocked ? "Lead already unlocked." : "Lead unlocked.");
      if ((json.remainingCredits ?? Number.POSITIVE_INFINITY) <= 2) {
        toast.warning("You're running low on credits. Buy more in My Plan.");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to unlock lead.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => void onUnlock()}
        disabled={loading || isRefreshing}
        className="w-full sm:w-auto"
        {...props}
      >
        <Lock className="mr-2 h-4 w-4" />
        {loading || isRefreshing ? "Unlocking..." : children ?? "Unlock - 1 Credit"}
      </Button>
      <OutOfCreditsModal
        open={showOutOfCreditsModal}
        onClose={() => setShowOutOfCreditsModal(false)}
      />
    </>
  );
}
