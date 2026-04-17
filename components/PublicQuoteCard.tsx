"use client";

import { useEffect, useState } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import type { QuoteStatus } from "@/lib/quoteStatus";
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
  // Already coerced by the server — SENT/VIEWED past the 7-day boundary
  // arrives as EXPIRED. This component does not need to compute expiry.
  status: QuoteStatus;
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

  const isDraft = quote.status === "DRAFT";

  // Don't fire the viewed POST for DRAFT quotes — the estimate hasn't been
  // delivered yet, so recording a view would be misleading.
  useEffect(() => {
    if (isDraft) return;
    fetch(`/api/public/quote/${quote.publicId}/viewed`, { method: "POST" }).catch(() => undefined);
  }, [quote.publicId, isDraft]);

  // Seed the client clock from the server status. The server already coerces
  // SENT/VIEWED past the 7-day boundary to EXPIRED at render time via
  // computeEffectiveQuoteStatus, so this starts accurate.
  const [clientNow, setClientNow] = useState(() => Date.now());

  // Keep the client clock refreshed so a customer who leaves the tab open
  // across the 7-day boundary sees the accept button disable without having
  // to refresh the page. Server enforcement still wins — /accept re-checks
  // expiry on every submission — this is UI-sync only.
  //
  // We only arm the interval when the quote could plausibly expire on
  // screen: terminal statuses (ACCEPTED, EXPIRED) and DRAFT never change.
  useEffect(() => {
    if (status === "ACCEPTED" || status === "EXPIRED" || isDraft) return;

    const tick = () => setClientNow(Date.now());
    const onFocus = () => tick();
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) tick();
    };

    // 60s keeps the button accurate within a minute of actual expiry
    // without burning CPU while idle. Focus/visibility handlers cover the
    // common "left tab open for hours, came back" case instantly.
    const interval = window.setInterval(tick, 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, isDraft]);

  const expiresAtMs = new Date(quote.expiresAt).getTime();
  const isExpired = status === "EXPIRED" || (!isDraft && clientNow > expiresAtMs);

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
      <div className="rounded-[14px] border border-border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="border-b border-border bg-muted px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3">
                <BrandLogo size="sm" />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                Estimate from
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">{quote.businessName}</h1>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="break-words" style={{ overflowWrap: "anywhere" }}>{quote.address}</span>
                </div>
                {quote.businessPhone ? (
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="break-words">{quote.businessPhone}</span>
                  </div>
                ) : null}
                {quote.businessEmail ? (
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="break-words" style={{ overflowWrap: "anywhere" }}>{quote.businessEmail}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[14px] border border-[#DBEAFE] bg-accent px-5 py-4 sm:min-w-[220px]">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-primary">
                Estimate Range
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-primary">
                {displayPrice}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Valid for 7 days from delivery.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-8 sm:py-8">
          <div className="rounded-[14px] border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
              Included Services
            </p>
            <p className="mt-2 break-words text-sm leading-6 text-foreground">{quote.services.join(", ")}</p>
          </div>

          <div className="rounded-[14px] border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
              Estimate Message
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-foreground" style={{ overflowWrap: "anywhere" }}>
              {quote.message}
            </p>
          </div>

          {isDraft ? (
            <div className="rounded-[14px] border border-[#DBEAFE] bg-accent p-4 text-center text-sm text-primary">
              This estimate is being finalized. Check back shortly.
            </div>
          ) : status === "ACCEPTED" ? (
            <div className="rounded-[14px] border border-[#BBF7D0] bg-green-50 dark:bg-green-950/30 p-4 text-sm text-[#166534]">
              Interested request received. {quote.businessName} will contact you shortly.
              {acceptedAt ? ` (${new Date(acceptedAt).toLocaleString()})` : ""}
            </div>
          ) : (
            <Button
              onClick={onAccept}
              disabled={loading || isExpired}
              className="h-12 w-full rounded-[10px] bg-primary text-sm font-semibold hover:bg-primary/90"
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
