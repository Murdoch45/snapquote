"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function CreditsAddedToast({ enabled }: { enabled: boolean }) {
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasShownRef.current) return;
    hasShownRef.current = true;
    toast.success("Credits added to your account!");
  }, [enabled]);

  return null;
}
