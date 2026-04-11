"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SubscriptionRequiredModal } from "@/components/SubscriptionRequiredModal";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PriceSlider } from "@/components/PriceSlider";
import { createClient } from "@/lib/supabase/client";
import { formatCurrencyRange } from "@/lib/utils";

type Props = {
  leadId: string;
  publicId: string;
  snapQuote: number;
  estimateLow: number | null;
  estimateHigh: number | null;
  serviceEstimates: Array<{
    service?: unknown;
    lowEstimate?: unknown;
    highEstimate?: unknown;
  }>;
  initialMessage: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  canSend: boolean;
};

export function QuoteComposer({
  leadId,
  publicId,
  snapQuote,
  estimateLow,
  estimateHigh,
  serviceEstimates,
  initialMessage,
  customerName,
  customerPhone,
  customerEmail,
  canSend
}: Props) {
  const [priceRange, setPriceRange] = useState(() => ({
    low: estimateLow ?? snapQuote,
    high: estimateHigh ?? snapQuote
  }));
  const [message, setMessage] = useState(initialMessage);
  const [messageGenerated, setMessageGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const sendingRange =
    formatCurrencyRange(priceRange.low, priceRange.high) ??
    `${priceRange.low} - ${priceRange.high}`;
  const multiServiceBreakdown = serviceEstimates.filter(
    (estimate) =>
      typeof estimate.service === "string" &&
      typeof estimate.lowEstimate === "number" &&
      typeof estimate.highEstimate === "number"
  );

  const copyText = async (value: string, successLabel: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successLabel);
    } catch {
      toast.error("Copy failed.");
    }
  };

  const onGenerateMessage = () => {
    setMessageGenerated(true);
  };

  const onSend = async (channel: "email" | "text") => {
    if (channel === "email" && !customerEmail) {
      toast.error("No customer email available.");
      return;
    }
    if (channel === "text" && !customerPhone) {
      toast.error("No customer phone number available.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/app/quote/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          publicId,
          estimatedPriceLow: priceRange.low,
          estimatedPriceHigh: priceRange.high,
          message,
          sendEmail: channel === "email",
          sendText: channel === "text"
        })
      });
      const json = await res.json();
      if (res.status === 402 || json.code === "SUBSCRIPTION_INACTIVE") {
        setShowSubscriptionModal(true);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Failed to send estimate.");
      setQuoteLink(json.publicUrl ?? null);
      setCopiedMessage(json.resolvedMessage ?? message);
      setSent(true);
      if (json.warning) {
        toast.warning(json.warning);
      } else {
        toast.success(`Estimate sent via ${channel === "email" ? "email" : "text"}.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send estimate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Price range editor — always visible */}
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">Estimate price range:</p>
          <p className="mt-1 text-3xl font-bold leading-none text-blue-600">{sendingRange}</p>
          {multiServiceBreakdown.length > 1 ? (
            <div className="space-y-2 rounded-lg border border-blue-100 bg-white/60 p-3">
              {multiServiceBreakdown.map((estimate) => (
                <div
                  key={`${estimate.service}-${estimate.lowEstimate}-${estimate.highEstimate}`}
                  className="flex items-center justify-between gap-4 text-sm text-gray-600"
                >
                  <span>{estimate.service as string}</span>
                  <span>
                    {formatCurrencyRange(estimate.lowEstimate as number, estimate.highEstimate as number)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <PriceSlider
            snapQuote={snapQuote}
            low={priceRange.low}
            high={priceRange.high}
            onChange={setPriceRange}
          />
        </div>

        {/* Phase 1: Generate button — visible before message is generated */}
        {!messageGenerated && !sent ? (
          <Button
            type="button"
            onClick={onGenerateMessage}
            disabled={!canSend}
            className="h-11 w-full rounded-[10px] bg-[#2563EB] text-sm font-semibold text-white hover:bg-[#1D4ED8]"
          >
            Generate Estimate
          </Button>
        ) : null}

        {/* Phase 2: Message + delivery options — visible after Generate or after sent */}
        {messageGenerated || sent ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="quote-message">Estimate message</Label>
              <Textarea
                id="quote-message"
                value={sent ? (copiedMessage ?? message) : message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                readOnly={sent}
                className={sent ? "pointer-events-none bg-gray-50" : undefined}
              />
            </div>

            {sent ? (
              <div className="space-y-3">
                <p className="text-sm text-emerald-700">
                  Estimate sent. You can copy the link or message below.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (quoteLink) {
                        void copyText(quoteLink, "Estimate link copied.");
                      }
                    }}
                  >
                    Copy Link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyText(copiedMessage ?? message, "Estimate message copied.")}
                  >
                    Copy Message
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => void onSend("email")}
                  disabled={loading || !canSend || !customerEmail}
                >
                  {loading ? "Sending..." : "Send via Email"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void onSend("text")}
                  disabled={loading || !canSend || !customerPhone}
                >
                  {loading ? "Sending..." : "Send via SMS"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyText(message, "Estimate message copied.")}
                >
                  Copy Message
                </Button>
              </div>
            )}
          </>
        ) : null}

        {!canSend && (
          <p className="text-sm text-red-600">
            Estimate limit exceeded. Upgrade to continue sending this month.
          </p>
        )}
      </div>
      <SubscriptionRequiredModal
        open={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </>
  );
}
