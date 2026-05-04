import { LeadCard } from "@/components/LeadCard";

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

export function LeadList({
  leads,
  onLeadUnlocked
}: {
  leads: Lead[];
  onLeadUnlocked: (args: { alreadyUnlocked: boolean }) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        No leads yet. Share your public URL to start receiving requests.
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} onLeadUnlocked={onLeadUnlocked} />
      ))}
    </div>
  );
}
