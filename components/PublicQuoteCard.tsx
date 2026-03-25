"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { formatCurrencyRange, toCurrency } from "@/lib/utils";

type QuoteData = {
  publicId: string;
  businessName: string;
  businessPhone: string | null;
  businessEmail: string | null;
  services: string[];
  address: string;
  price: number;
  estimatedPrice: number | string | null;
  estimatedPriceLow: number | string | null;
  estimatedPriceHigh: number | string | null;
  message: string;
  status: "SENT" | "VIEWED" | "ACCEPTED" | "EXPIRED";
  sentAt: string;
  expiresAt: string;
};

export function PublicQuoteCard({ quote }: { quote: QuoteData }) {
  const [status, setStatus] = useState(quote.status);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const displayPrice =
    formatCurrencyRange(quote.estimatedPriceLow, quote.estimatedPriceHigh, quote.estimatedPrice) ??
    toCurrency(quote.price);

  useEffect(() => {
    fetch(`/api/public/quote/${quote.publicId}/viewed`, { method: "POST" }).catch(() => undefined);
  }, [quote.publicId]);

  const isExpired = useMemo(() => new Date() > new Date(quote.expiresAt), [quote.expiresAt]);

  const onAccept = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/quote/${quote.publicId}/accept`, {
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not accept estimate.");
      setStatus("ACCEPTED");
      setAcceptedAt(json.acceptedAt ?? null);
      toast.success("Estimate accepted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept estimate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#E5E7EB] bg-[#F8F9FC] px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3">
                <BrandLogo size="sm" />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                Estimate from
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[#111827]">{quote.businessName}</h1>
              <div className="mt-3 space-y-2 text-sm text-[#4B5563]">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#2563EB]" />
                  <span>{quote.address}</span>
                </div>
                {quote.businessPhone ? (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#2563EB]" />
                    <span>{quote.businessPhone}</span>
                  </div>
                ) : null}
                {quote.businessEmail ? (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#2563EB]" />
                    <span>{quote.businessEmail}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[14px] border border-[#DBEAFE] bg-[#EFF6FF] px-5 py-4 sm:min-w-[220px]">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#2563EB]">
                Estimate Range
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#2563EB]">
                {displayPrice}
              </p>
              <p className="mt-2 text-sm text-[#4B5563]">Valid for 7 days from delivery.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-8 sm:py-8">
          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
              Included Services
            </p>
            <p className="mt-2 text-sm leading-6 text-[#111827]">{quote.services.join(", ")}</p>
          </div>

          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
              Estimate Message
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#111827]">
              {quote.message}
            </p>
          </div>

          {status === "ACCEPTED" ? (
            <div className="rounded-[14px] border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm text-[#166534]">
              Interested request received. {quote.businessName} will contact you shortly.
              {acceptedAt ? ` (${new Date(acceptedAt).toLocaleString()})` : ""}
            </div>
          ) : (
            <Button
              onClick={onAccept}
              disabled={loading || isExpired}
              className="h-12 w-full rounded-[10px] bg-[#2563EB] text-sm font-semibold hover:bg-[#1D4ED8]"
            >
              {isExpired
                ? "Estimate expired"
                : loading
                  ? "Sending..."
                  : "I'm Interested — Request to Book"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
