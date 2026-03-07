"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PriceSlider } from "@/components/PriceSlider";

type Props = {
  leadId: string;
  estimateLow: number;
  estimateHigh: number;
  suggestedPrice: number;
  draftMessage: string;
  canSend: boolean;
};

export function QuoteComposer({
  leadId,
  estimateLow,
  estimateHigh,
  suggestedPrice,
  draftMessage,
  canSend
}: Props) {
  const [price, setPrice] = useState(suggestedPrice);
  const [message, setMessage] = useState(draftMessage);
  const [loading, setLoading] = useState(false);

  const onSend = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/app/quote/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          price,
          message
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send quote.");
      toast.success("Quote sent to customer.");
      window.location.href = "/app/quotes";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send quote.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PriceSlider
        estimateLow={estimateLow}
        estimateHigh={estimateHigh}
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
      <Button onClick={onSend} disabled={loading || !canSend}>
        {loading ? "Sending..." : "Send Quote"}
      </Button>
      {!canSend && (
        <p className="text-sm text-red-600">
          Quote limit exceeded. Upgrade to continue sending this month.
        </p>
      )}
    </div>
  );
}
