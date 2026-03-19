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
    ai_suggested_price: number | null;
    photo_count?: number;
  };
  isLocked: boolean;
};

function getVisibleAddress(address: string): string {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return "Address hidden";
  return parts.slice(1).join(", ");
}

export function LeadCard({ lead, isLocked }: LeadCardProps) {
  console.log("LeadCard rendered:", {
    isLocked,
    addressFull: lead.address_full,
    visibleAddress: getVisibleAddress(lead.address_full)
  });

  return (
    <Card className="hover:border-blue-300">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">Submitted {toRelativeMinutes(lead.submitted_at)}</p>
            <p className="text-sm font-medium text-gray-900">
              {isLocked ? getVisibleAddress(lead.address_full) : lead.address_full}
            </p>
          </div>
          <Badge variant="muted">{lead.photo_count ?? 0} photos</Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          {lead.services.map((service) => (
            <Badge key={service}>{service}</Badge>
          ))}
        </div>
        <p className="text-sm text-gray-700">
          {`SnapQuote estimate: ${toCurrency(lead.ai_suggested_price ?? 0)}`}
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
