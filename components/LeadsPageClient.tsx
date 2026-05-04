"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LeadsRealtimeWatcher } from "@/components/LeadsRealtimeWatcher";
import { LeadList } from "@/components/LeadList";

type Lead = {
  id: string;
  fullAddress: string | null;
  locality: string;
  services: string[];
  submitted_at: string;
  ai_status: string;
  ai_suggested_price: number | null;
  ai_estimate_low: number | null;
  ai_estimate_high: number | null;
  photo_count?: number;
  previewPhotos: string[];
  ai_job_summary: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  isUnlocked: boolean;
};

export function LeadsPageClient({
  orgId,
  leads,
  initialCreditsRemaining,
  currentPage,
  totalPages,
  totalLeads
}: {
  orgId: string;
  leads: Lead[];
  initialCreditsRemaining: number;
  currentPage: number;
  totalPages: number;
  totalLeads: number;
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
        <div className="rounded-[10px] border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {creditsRemaining} credits remaining
        </div>
      </div>
      <LeadList leads={leads} onLeadUnlocked={onLeadUnlocked} />
      {totalLeads > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p>
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={`/app/leads?page=${currentPage - 1}`}
                className="rounded-[10px] border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-[10px] border border-border px-4 py-2 font-medium text-muted-foreground/70">
                Previous
              </span>
            )}
            {currentPage < totalPages ? (
              <Link
                href={`/app/leads?page=${currentPage + 1}`}
                className="rounded-[10px] border border-primary bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary/90"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-[10px] border border-border px-4 py-2 font-medium text-muted-foreground/70">
                Next
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
