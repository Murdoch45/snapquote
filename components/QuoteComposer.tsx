"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [hasGeneratedBefore, setHasGeneratedBefore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Delivery preference — persisted per-org via Supabase contractor_profile
  const [sendEmail, setSendEmail] = useState(true);
  const [sendText, setSendText] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const sendingRange =
    formatCurrencyRange(priceRange.low, priceRange.high) ??
    `${priceRange.low} - ${priceRange.high}`;
  const multiServiceBreakdown = serviceEstimates.filter(
    (estimate) =>
      typeof estimate.service === "string" &&
      typeof estimate.lowEstimate === "number" &&
      typeof estimate.highEstimate === "number"
  );

  // Load delivery preferences from contractor_profile
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("contractor_profile")
          .select("estimate_send_email,estimate_send_text")
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (data) {
          const prefEmail = data.estimate_send_email;
          const prefText = data.estimate_send_text;
          // Only apply if at least one is true
          if (prefEmail === true || prefText === true) {
            setSendEmail(prefEmail === true);
            setSendText(prefText === true);
          }
        }
      } catch {
        // Fall back to defaults
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  // Save delivery preferences when they change
  useEffect(() => {
    if (!prefsLoaded) return;

    const save = async () => {
      try {
        const supabase = createClient();
        // Best-effort save — don't block the UI if the columns don't exist yet
        await supabase
          .from("contractor_profile")
          .update({
            estimate_send_email: sendEmail,
            estimate_send_text: sendText
          })
          .limit(1);
      } catch {
        // Non-critical — preference will still work locally for this session
      }
    };

    void save();
  }, [sendEmail, sendText, prefsLoaded]);

  const toggleEmail = (checked: boolean) => {
    // Prevent unchecking both
    if (!checked && !sendText) return;
    setSendEmail(checked);
  };

  const toggleText = (checked: boolean) => {
    if (!checked && !sendEmail) return;
    setSendText(checked);
  };

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
    setHasGeneratedBefore(true);
  };

  const onEditEstimate = () => {
    setMessageGenerated(false);
  };

  const onSend = async () => {
    if (!sendEmail && !sendText) {
      toast.error("Select email, text, or both before sending.");
      return;
    }
    if (sendEmail && !customerEmail) {
      toast.error("No customer email available.");
      return;
    }
    if (sendText && !customerPhone) {
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
          sendEmail,
          sendText
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
      const channels = (json.sentChannels ?? []) as string[];
      const channelLabel = channels.join(" and ") || "successfully";
      if (json.warning) {
        toast.warning(json.warning);
      } else {
        toast.success(`Estimate sent via ${channelLabel}.`);
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
        {/* Price range editor — visible in Phase 1 and while not sent */}
        {!sent ? (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Estimate price range:</p>
            <p className="mt-1 text-3xl font-bold leading-none text-blue-600">{sendingRange}</p>
            {multiServiceBreakdown.length > 1 ? (
              <div className="space-y-2 rounded-lg border border-blue-100 bg-card/60 p-3">
                {multiServiceBreakdown.map((estimate) => (
                  <div
                    key={`${estimate.service}-${estimate.lowEstimate}-${estimate.highEstimate}`}
                    className="flex items-center justify-between gap-4 text-sm text-muted-foreground"
                  >
                    <span>{estimate.service as string}</span>
                    <span>
                      {formatCurrencyRange(estimate.lowEstimate as number, estimate.highEstimate as number)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {!messageGenerated ? (
              <PriceSlider
                snapQuote={snapQuote}
                low={priceRange.low}
                high={priceRange.high}
                onChange={setPriceRange}
              />
            ) : null}
          </div>
        ) : null}

        {/* Phase 1: Generate button */}
        {!messageGenerated && !sent ? (
          <Button
            type="button"
            onClick={onGenerateMessage}
            disabled={!canSend}
            className="h-11 w-full rounded-[10px] bg-primary text-sm font-semibold text-white hover:bg-primary/90"
          >
            {hasGeneratedBefore ? "Regenerate Estimate" : "Generate Estimate"}
          </Button>
        ) : null}

        {/* Phase 2: Message + delivery options */}
        {messageGenerated && !sent ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="quote-message">Estimate message</Label>
              <Textarea
                id="quote-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
              />
            </div>

            {/* Delivery checkboxes */}
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="mb-3 text-sm font-medium text-foreground/80">Delivery method</p>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sendEmail}
                    disabled={!customerEmail}
                    onCheckedChange={(checked) => toggleEmail(checked === true)}
                  />
                  <span>Email{!customerEmail ? " (no customer email)" : ""}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sendText}
                    disabled={!customerPhone}
                    onCheckedChange={(checked) => toggleText(checked === true)}
                  />
                  <span>Text{!customerPhone ? " (no customer phone)" : ""}</span>
                </label>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void onSend()}
                disabled={loading || !canSend || (!sendEmail && !sendText)}
                className="bg-primary text-white hover:bg-primary/90"
              >
                {loading ? "Sending..." : "Send Estimate"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyText(message, "Estimate message copied.")}
              >
                Copy Message
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-border bg-muted text-foreground/80 hover:bg-border"
                onClick={onEditEstimate}
              >
                Edit Estimate
              </Button>
            </div>
          </>
        ) : null}

        {/* Post-send state */}
        {sent ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="quote-message-sent">Estimate message</Label>
              <Textarea
                id="quote-message-sent"
                value={copiedMessage ?? message}
                rows={7}
                readOnly
                className="pointer-events-none bg-muted"
              />
            </div>
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
