import { LeadCard } from "@/components/LeadCard";

type Lead = {
  id: string;
  address_full: string;
  services: string[];
  submitted_at: string;
  ai_suggested_price: number | null;
  photo_count?: number;
  isLocked: boolean;
};

export function LeadList({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No leads yet. Share your public slug to start receiving requests.
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} isLocked={lead.isLocked} />
      ))}
  </div>
);
}
