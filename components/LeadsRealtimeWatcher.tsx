"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  orgId: string;
  onRefresh: () => void;
};

export function LeadsRealtimeWatcher({ orgId, onRefresh }: Props) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`leads-org-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `org_id=eq.${orgId}`
        },
        () => onRefresh()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `org_id=eq.${orgId}`
        },
        () => onRefresh()
      )
      .subscribe();

    const interval = window.setInterval(() => onRefresh(), 10_000);

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [orgId, onRefresh]);

  return null;
}
