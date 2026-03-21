"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LeadsRealtimeWatcher } from "@/components/LeadsRealtimeWatcher";
import { LeadList } from "@/components/LeadList";
import type { LeadQuestionPreview } from "@/lib/leadPresentation";

type Lead = {
  id: string;
  fullAddress: string | null;
  locality: string;
  services: string[];
  submitted_at: string;
  ai_suggested_price: number | null;
  photo_count?: number;
  description: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  jobType: string;
  questionPreview: LeadQuestionPreview[];
  isUnlocked: boolean;
};

export function LeadsPageClient({
  orgId,
  leads,
  initialCreditsRemaining
}: {
  orgId: string;
  leads: Lead[];
  initialCreditsRemaining: number;
}) {
  const router = useRouter();
  const [creditsRemaining, setCreditsRemaining] = useState(initialCreditsRemaining);

  useEffect(() => {
    setCreditsRemaining(initialCreditsRemaining);
  }, [initialCreditsRemaining]);

  const onLeadUnlocked = ({ alreadyUnlocked }: { alreadyUnlocked: boolean }) => {
    if (!alreadyUnlocked) {
      setCreditsRemaining((current) => Math.max(0, current - 1));
    }
  };

  return (
    <div className="space-y-6">
      <LeadsRealtimeWatcher orgId={orgId} onRefresh={() => router.refresh()} />
      <div className="flex flex-wrap items-start justify-end gap-4">
        <div className="rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {creditsRemaining} credits remaining
        </div>
      </div>
      <LeadList leads={leads} onLeadUnlocked={onLeadUnlocked} />
    </div>
  );
}
