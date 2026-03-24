import Link from "next/link";
import { Lock } from "lucide-react";
import { LeadUnlockButton } from "@/components/LeadUnlockButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getServiceBadgeStyle } from "@/lib/serviceColors";
import { formatCurrencyRange, toRelativeMinutes } from "@/lib/utils";

type LeadCardProps = {
  lead: {
    id: string;
    fullAddress: string | null;
    locality: string;
    services: string[];
    submitted_at: string;
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
  onLeadUnlocked: (args: { alreadyUnlocked: boolean }) => void;
};

export function LeadCard({ lead, onLeadUnlocked }: LeadCardProps) {
  const displayEstimate =
    formatCurrencyRange(lead.ai_estimate_low, lead.ai_estimate_high, lead.ai_suggested_price) ??
    "Pending estimate...";
  const previewSummary = lead.ai_job_summary
    ? lead.ai_job_summary.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.slice(0, 2).join(" ").trim() ?? lead.ai_job_summary
    : null;

  return (
    <Card className="h-full rounded-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(lead.services.length > 0 ? lead.services : ["Service"]).map((service) => (
                <Badge
                  key={service}
                  className="border-transparent px-3 py-1 text-xs font-semibold"
                  style={getServiceBadgeStyle(service)}
                >
                  {service}
                </Badge>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#111827]">{lead.locality}</p>
              <p className="text-sm text-[#6B7280]">
                Submitted {toRelativeMinutes(lead.submitted_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge className="border-transparent bg-[#F9FAFB] text-[#6B7280]">
              {lead.photo_count ?? 0} photos
            </Badge>
            {lead.isUnlocked ? (
              <Badge className="border-transparent bg-[#EFF6FF] text-[#2563EB]">Unlocked</Badge>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">
            AI Estimate
          </p>
          <p className="text-[28px] font-bold leading-none text-[#2563EB]">
            {displayEstimate}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
            Job Details
          </p>
          {previewSummary ? (
            <p className="text-sm text-[#111827]">{previewSummary}</p>
          ) : null}
        </div>

        <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] p-3">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#6B7280]" />
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
              Contact Info
            </p>
          </div>
          {lead.isUnlocked ? (
            <div className="space-y-1 text-sm text-[#111827]">
              <p>{lead.customerName || "No name provided"}</p>
              <p>{lead.customerPhone || "No phone provided"}</p>
              <p>{lead.customerEmail || "No email provided"}</p>
              <p>{lead.fullAddress || lead.locality}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="select-none rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#6B7280] blur-sm">
                <p>Customer name hidden</p>
                <p>Phone hidden</p>
                <p>Email hidden</p>
                <p>Street address hidden</p>
              </div>
              <LeadUnlockButton leadId={lead.id} onUnlocked={onLeadUnlocked} size="sm">
                Unlock - 1 Credit
              </LeadUnlockButton>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          {lead.isUnlocked ? (
            <Button
              asChild
              variant="outline"
              className="h-auto border-2 border-[#2563EB] bg-transparent px-5 py-2 font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
            >
              <Link href={`/app/leads/${lead.id}`}>View</Link>
            </Button>
          ) : (
            <Link
              className="inline-flex text-sm font-medium text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
              href={`/app/leads/${lead.id}`}
            >
              Open lead
            </Link>
          )}

          {lead.previewPhotos.length > 0 ? (
            <div className="flex gap-2">
              {lead.previewPhotos.slice(0, 2).map((photoUrl, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${lead.id}-preview-${index}`}
                  src={photoUrl}
                  alt="Lead preview"
                  className="h-24 w-32 rounded-[10px] object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
