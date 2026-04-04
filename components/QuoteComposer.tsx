"use client";

import Link from "next/link";
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
  customerAddress: string | null;
  canSend: boolean;
  isLocked: boolean;
};

function getAddressParts(address: string | null): { street: string; locality: string } {
  if (!address) {
    return {
      street: "No address",
      locality: "No address"
    };
  }

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return {
      street: address,
      locality: "Address hidden"
    };
  }

  return {
    street: parts[0],
    locality: parts.slice(1).join(", ")
  };
}

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
  customerAddress,
  canSend,
  isLocked
}: Props) {
  const [priceRange, setPriceRange] = useState(() => ({
    low: estimateLow ?? snapQuote,
    high: estimateHigh ?? snapQuote
  }));
  const [message, setMessage] = useState(initialMessage);
  const [deliveryPreference, setDeliveryPreference] = useState({
    sendEmail: true,
    sendText: false
  });
  const [preferenceKey, setPreferenceKey] = useState<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const addressParts = getAddressParts(customerAddress);
  const sendingRange = formatCurrencyRange(priceRange.low, priceRange.high) ?? `${priceRange.low} - ${priceRange.high}`;
  const multiServiceBreakdown = serviceEstimates.filter(
    (estimate) =>
      typeof estimate.service === "string" &&
      typeof estimate.lowEstimate === "number" &&
      typeof estimate.highEstimate === "number"
  );
  const sendEmail = deliveryPreference.sendEmail && Boolean(customerEmail);
  const sendText = deliveryPreference.sendText && Boolean(customerPhone);

  useEffect(() => {
    let cancelled = false;

    const loadPreferences = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (!user?.id) {
          setPreferenceKey(null);
          setDeliveryPreference({ sendEmail: true, sendText: false });
          setPreferencesLoaded(true);
          return;
        }

        const nextPreferenceKey = `snapquote:quote-composer:${user.id}`;
        setPreferenceKey(nextPreferenceKey);

        const storedValue = window.localStorage.getItem(nextPreferenceKey);
        if (!storedValue) {
          setDeliveryPreference({ sendEmail: true, sendText: false });
          setPreferencesLoaded(true);
          return;
        }

        const parsed = JSON.parse(storedValue) as {
          sendEmail?: unknown;
          sendText?: unknown;
        };

        setDeliveryPreference({
          sendEmail: parsed.sendEmail === false ? false : true,
          sendText: parsed.sendText === true
        });
      } catch {
        setPreferenceKey(null);
        setDeliveryPreference({ sendEmail: true, sendText: false });
      } finally {
        if (!cancelled) {
          setPreferencesLoaded(true);
        }
      }
    };

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded || !preferenceKey) return;

    window.localStorage.setItem(preferenceKey, JSON.stringify(deliveryPreference));
  }, [deliveryPreference, preferenceKey, preferencesLoaded]);

  const copyText = async (value: string, successLabel: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successLabel);
    } catch {
      toast.error("Copy failed.");
    }
  };

  const onSend = async () => {
    if (isLocked) {
      toast.error("Upgrade your plan to contact this customer and send estimates.");
      return;
    }

    if (!sendEmail && !sendText) {
      toast.error("Select email, text, or both before sending.");
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
      if (json.warning) {
        toast.warning(json.warning);
      } else {
        toast.success("Estimate sent to customer.");
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
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Customer Contact</p>
          <div className={`space-y-1 text-sm ${isLocked ? "select-none" : ""}`}>
            <div className={isLocked ? "blur-sm" : ""}>
              <p className="text-gray-700">{customerName || "No name"}</p>
              <p className="text-gray-600">{customerPhone || "No phone"}</p>
              <p className="text-gray-600">{customerEmail || "No email"}</p>
              <p className="text-gray-600">{isLocked ? addressParts.street : null}</p>
            </div>
            <p className="text-gray-600">
              {isLocked ? addressParts.locality : (customerAddress || "No address")}
            </p>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">Sending to customer:</p>
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
        <div className="space-y-2">
          <Label htmlFor="quote-message">Estimate message</Label>
          <Textarea
            id="quote-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
          />
        </div>
        <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sendEmail}
              disabled={!customerEmail}
              onCheckedChange={(checked) =>
                setDeliveryPreference((prev) => ({ ...prev, sendEmail: checked === true }))
              }
            />
            <span>Email{!customerEmail ? " (no customer email)" : ""}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sendText}
              disabled={!customerPhone}
              onCheckedChange={(checked) =>
                setDeliveryPreference((prev) => ({ ...prev, sendText: checked === true }))
              }
            />
            <span>Text{!customerPhone ? " (no customer phone)" : ""}</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onSend} disabled={loading || !canSend || sent || isLocked}>
            {sent ? "Estimate Sent" : loading ? "Sending..." : "Send Estimate"}
          </Button>
          {isLocked ? (
            <Button asChild variant="outline">
              <Link href="/app/plan">Upgrade Plan</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!quoteLink) {
                toast.error("Send the estimate first to copy its link.");
                return;
              }
              void copyText(quoteLink, "Estimate link copied.");
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
        {!canSend && (
          <p className="text-sm text-red-600">
            Estimate limit exceeded. Upgrade to continue sending this month.
          </p>
        )}
        {isLocked && (
          <p className="text-sm text-amber-700">
            Upgrade your plan to contact this customer and send estimates.
          </p>
        )}
        {sent && (
          <p className="text-sm text-emerald-700">
            Estimate sent. You can now copy the link or message above.
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
