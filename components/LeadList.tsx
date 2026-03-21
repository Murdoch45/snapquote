import { LeadCard } from "@/components/LeadCard";
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

export function LeadList({
  leads,
  onLeadUnlocked
}: {
  leads: Lead[];
  onLeadUnlocked: (args: { alreadyUnlocked: boolean }) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-[#E5E7EB] bg-white p-8 text-center text-sm text-[#6B7280] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        No leads yet. Share your public slug to start receiving requests.
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} onLeadUnlocked={onLeadUnlocked} />
      ))}
    </div>
  );
}
