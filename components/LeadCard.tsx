import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toCurrency, toRelativeMinutes } from "@/lib/utils";

type LeadCardProps = {
  lead: {
    id: string;
    address_full: string;
    services: string[];
    submitted_at: string;
    ai_estimate_low: number | null;
    ai_estimate_high: number | null;
    photo_count?: number;
  };
};

export function LeadCard({ lead }: LeadCardProps) {
  const hasEstimate = lead.ai_estimate_low !== null && lead.ai_estimate_high !== null;
  return (
    <Card className="hover:border-blue-300">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">Submitted {toRelativeMinutes(lead.submitted_at)}</p>
            <p className="text-sm font-medium text-gray-900">{lead.address_full}</p>
          </div>
          <Badge variant="muted">{lead.photo_count ?? 0} photos</Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          {lead.services.map((service) => (
            <Badge key={service}>{service}</Badge>
          ))}
        </div>
        <p className="text-sm text-gray-700">
          {hasEstimate
            ? `AI range: ${toCurrency(lead.ai_estimate_low)} - ${toCurrency(lead.ai_estimate_high)}`
            : "AI estimate pending"}
        </p>
        <Link
          className="inline-flex text-sm font-medium text-primary hover:text-blue-700"
          href={`/app/leads/${lead.id}`}
        >
          Open lead
        </Link>
      </CardContent>
    </Card>
  );
}
