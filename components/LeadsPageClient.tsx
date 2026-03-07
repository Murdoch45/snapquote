"use client";

import { useRouter } from "next/navigation";
import { LeadsRealtimeWatcher } from "@/components/LeadsRealtimeWatcher";
import { LeadList } from "@/components/LeadList";

type Lead = {
  id: string;
  address_full: string;
  services: string[];
  submitted_at: string;
  ai_estimate_low: number | null;
  ai_estimate_high: number | null;
  photo_count?: number;
};

export function LeadsPageClient({ orgId, leads }: { orgId: string; leads: Lead[] }) {
  const router = useRouter();
  return (
    <>
      <LeadsRealtimeWatcher orgId={orgId} onRefresh={() => router.refresh()} />
      <LeadList leads={leads} />
    </>
  );
}
