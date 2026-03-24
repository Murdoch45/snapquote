"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { formatCurrencyRange, toCurrency } from "@/lib/utils";

type QuoteData = {
  publicId: string;
  businessName: string;
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
    <div className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <BrandLogo size="sm" />
      </div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{quote.businessName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-gray-900">{displayPrice}</h1>
      <p className="mt-1 text-sm text-gray-600">{quote.address}</p>
      <p className="mt-2 text-sm text-gray-700">{quote.services.join(", ")}</p>
      <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{quote.message}</p>
      <p className="mt-3 text-xs text-gray-500">Estimate valid for 7 days</p>

      {status === "ACCEPTED" ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Accepted - contractor will contact you shortly.
          {acceptedAt ? ` (${new Date(acceptedAt).toLocaleString()})` : ""}
        </div>
      ) : (
        <Button onClick={onAccept} disabled={loading || isExpired} className="mt-4 w-full">
          {isExpired ? "Estimate expired" : loading ? "Accepting..." : "Accept Estimate"}
        </Button>
      )}
    </div>
  );
}
