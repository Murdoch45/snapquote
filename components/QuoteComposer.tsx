"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SubscriptionRequiredModal } from "@/components/SubscriptionRequiredModal";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PriceSlider } from "@/components/PriceSlider";

type Props = {
  leadId: string;
  snapQuote: number;
  initialMessage: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  canSend: boolean;
  isLocked: boolean;
};

function getVisibleAddress(address: string | null): string {
  if (!address) return "No address";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return "Address hidden";
  return parts.slice(1).join(", ");
}

export function QuoteComposer({
  leadId,
  snapQuote,
  initialMessage,
  customerName,
  customerPhone,
  customerEmail,
  customerAddress,
  canSend,
  isLocked
}: Props) {
  const [price, setPrice] = useState(snapQuote);
  const [message, setMessage] = useState(initialMessage);
  const [sendEmail, setSendEmail] = useState(Boolean(customerEmail));
  const [sendText, setSendText] = useState(Boolean(customerPhone));
  const [loading, setLoading] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
      toast.error("Upgrade your plan to contact this customer and send quotes.");
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
          price,
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
      if (!res.ok) throw new Error(json.error || "Failed to send quote.");
      setQuoteLink(json.publicUrl ?? null);
      setCopiedMessage(json.resolvedMessage ?? message);
      setSent(true);
      if (json.warning) {
        toast.warning(json.warning);
      } else {
        toast.success("Quote sent to customer.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send quote.");
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
            </div>
            <p className="text-gray-600">
              {isLocked ? getVisibleAddress(customerAddress) : (customerAddress || "No address")}
            </p>
          </div>
        </div>
        <PriceSlider
          snapQuote={snapQuote}
          value={price}
          onChange={setPrice}
        />
        <div className="space-y-2">
          <Label htmlFor="quote-message">Quote message</Label>
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
              onCheckedChange={(checked) => setSendEmail(checked === true)}
            />
            <span>Email{!customerEmail ? " (no customer email)" : ""}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sendText}
              disabled={!customerPhone}
              onCheckedChange={(checked) => setSendText(checked === true)}
            />
            <span>Text{!customerPhone ? " (no customer phone)" : ""}</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onSend} disabled={loading || !canSend || sent || isLocked}>
            {sent ? "Quote Sent" : loading ? "Sending..." : "Send Quote"}
          </Button>
          {isLocked ? (
            <Button asChild variant="outline">
              <Link href="/pricing">Upgrade Plan</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!quoteLink) {
                toast.error("Send the quote first to copy its link.");
                return;
              }
              void copyText(quoteLink, "Quote link copied.");
            }}
          >
            Copy Link
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyText(copiedMessage ?? message, "Quote message copied.")}
          >
            Copy Message
          </Button>
        </div>
        {!canSend && (
          <p className="text-sm text-red-600">
            Quote limit exceeded. Upgrade to continue sending this month.
          </p>
        )}
        {isLocked && (
          <p className="text-sm text-amber-700">
            Upgrade your plan to contact this customer and send quotes.
          </p>
        )}
        {sent && (
          <p className="text-sm text-emerald-700">
            Quote sent. You can now copy the link or message above.
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
