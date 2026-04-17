"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  // When true the composer opens in phase 2 with the existing estimate
  // pre-filled — used for "Edit & Resend" on expired quotes. The send
  // endpoint also accepts EXPIRED as a valid starting status for the CAS.
  isResend?: boolean;
};

// Simple regex validators mirroring the leadSubmitSchema's phone/email
// rules. Kept here so the inline contact-edit UX can give immediate
// feedback without a round-trip to the API for format checks.
const PHONE_REGEX = /^[+\d().\-\s]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  canSend,
  isResend = false
}: Props) {
  // Original AI estimate captured once at mount. The "Reset to AI estimate"
  // button below uses these to revert any manual slider/input adjustments.
  // If the lead has no AI range at all we fall back to the snapQuote
  // single-value estimate for both sides.
  const originalRange = {
    low: estimateLow ?? snapQuote,
    high: estimateHigh ?? snapQuote
  };
  const [priceRange, setPriceRange] = useState(() => ({
    low: originalRange.low,
    high: originalRange.high
  }));
  const [message, setMessage] = useState(initialMessage);
  // Skip phase 1 on resend — the contractor already has a message to edit
  // and doesn't need to click "Generate" to surface it.
  const [messageGenerated, setMessageGenerated] = useState<boolean>(isResend);
  const [hasGeneratedBefore, setHasGeneratedBefore] = useState<boolean>(isResend);
  const [loading, setLoading] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Delivery preference — persisted per-org via Supabase contractor_profile
  const [sendEmail, setSendEmail] = useState(true);
  const [sendText, setSendText] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Customer contact (email + phone) — editable via a small inline form so
  // a typo captured on the public lead submit can be corrected without the
  // contractor having to bail out and edit the lead row by hand. Saved
  // changes hit the leads table via PATCH /api/app/leads/[id]/contact.
  const [contactEmail, setContactEmail] = useState<string | null>(customerEmail);
  const [contactPhone, setContactPhone] = useState<string | null>(customerPhone);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactDraftEmail, setContactDraftEmail] = useState(customerEmail ?? "");
  const [contactDraftPhone, setContactDraftPhone] = useState(customerPhone ?? "");
  const [isSavingContact, setIsSavingContact] = useState(false);

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

  // Save delivery preferences when they change. Toast on failure so the
  // contractor knows the pref didn't actually persist — previously the
  // catch block swallowed the error, which meant a PostgREST permission
  // failure or missing column silently reverted the saved value on next
  // load. Success stays silent; these toggles flip a lot and don't need
  // their own confirmation.
  useEffect(() => {
    if (!prefsLoaded) return;

    const save = async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("contractor_profile")
          .update({
            estimate_send_email: sendEmail,
            estimate_send_text: sendText
          })
          .limit(1);
        if (error) {
          throw error;
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `Couldn't save delivery preference: ${error.message}`
            : "Couldn't save delivery preference."
        );
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

  const onStartEditContact = () => {
    setContactDraftEmail(contactEmail ?? "");
    setContactDraftPhone(contactPhone ?? "");
    setIsEditingContact(true);
  };

  const onCancelEditContact = () => {
    setIsEditingContact(false);
  };

  const onSaveContact = async () => {
    const trimmedEmail = contactDraftEmail.trim();
    const trimmedPhone = contactDraftPhone.trim();

    // Light client-side validation — matches the server's zod rules so the
    // user gets immediate feedback instead of a 400 round-trip.
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      toast.error("Enter a valid customer email, or clear the field.");
      return;
    }
    if (trimmedPhone && !PHONE_REGEX.test(trimmedPhone)) {
      toast.error("Enter a valid customer phone number, or clear the field.");
      return;
    }

    setIsSavingContact(true);
    try {
      const res = await fetch(`/api/app/leads/${leadId}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: trimmedEmail || null,
          customerPhone: trimmedPhone || null
        })
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        customerEmail?: string | null;
        customerPhone?: string | null;
      };
      if (!res.ok || json.ok !== true) {
        throw new Error(json.error || "Couldn't save contact details.");
      }
      setContactEmail(json.customerEmail ?? null);
      setContactPhone(json.customerPhone ?? null);
      setIsEditingContact(false);
      toast.success("Customer contact updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save contact details.");
    } finally {
      setIsSavingContact(false);
    }
  };

  const onSend = async () => {
    if (!sendEmail && !sendText) {
      toast.error("Select email, text, or both before sending.");
      return;
    }
    if (sendEmail && !contactEmail) {
      toast.error("No customer email available.");
      return;
    }
    if (sendText && !contactPhone) {
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
      // Prefer the server-resolved message (tokens replaced with real
      // values) for the post-send preview. The fallback to the raw
      // template is a last-resort belt-and-braces — if it ever shows a
      // "{{customer_name}}" token on screen something is off upstream.
      const resolved =
        typeof json.resolvedMessage === "string" && json.resolvedMessage.trim().length > 0
          ? json.resolvedMessage
          : message;
      setCopiedMessage(resolved);
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

  const primarySendLabel = isResend ? "Resend Estimate" : "Send Estimate";
  const primarySendingLabel = isResend ? "Resending..." : "Sending...";
  const postSendHeading = isResend ? "Resent." : "Estimate sent.";

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
              <>
                <PriceSlider
                  snapQuote={snapQuote}
                  low={priceRange.low}
                  high={priceRange.high}
                  onChange={setPriceRange}
                />
                {/* Reset-to-AI-estimate action — only surfaces when the
                    current range has drifted from what the AI produced,
                    so it doesn't clutter the slider when nothing's been
                    adjusted yet. Matches the muted-link pattern used
                    elsewhere on the lead detail page. */}
                {priceRange.low !== originalRange.low ||
                priceRange.high !== originalRange.high ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setPriceRange({ low: originalRange.low, high: originalRange.high })
                      }
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Reset to AI estimate
                    </button>
                  </div>
                ) : null}
              </>
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

            {/* Customer contact — editable inline so typos captured on the
                lead form can be fixed before send. Save writes through to
                the leads table via PATCH /api/app/leads/[id]/contact. */}
            <div className="space-y-2 rounded-lg border border-border bg-muted p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground/80">Customer contact</p>
                {!isEditingContact ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onStartEditContact}
                    className="h-auto px-2 py-1 text-xs text-primary hover:bg-accent"
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                ) : null}
              </div>
              {!isEditingContact ? (
                <div className="space-y-1 text-sm text-foreground/80">
                  <p>
                    Email: {contactEmail ? contactEmail : <span className="text-muted-foreground">—</span>}
                  </p>
                  <p>
                    Phone: {contactPhone ? contactPhone : <span className="text-muted-foreground">—</span>}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="contact-email" className="text-xs text-muted-foreground">
                      Customer email
                    </Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={contactDraftEmail}
                      onChange={(e) => setContactDraftEmail(e.target.value)}
                      placeholder="customer@example.com"
                      disabled={isSavingContact}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="contact-phone" className="text-xs text-muted-foreground">
                      Customer phone
                    </Label>
                    <Input
                      id="contact-phone"
                      type="tel"
                      value={contactDraftPhone}
                      onChange={(e) => setContactDraftPhone(e.target.value)}
                      placeholder="+1 555 123 4567"
                      disabled={isSavingContact}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onSaveContact()}
                      disabled={isSavingContact}
                    >
                      {isSavingContact ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onCancelEditContact}
                      disabled={isSavingContact}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery checkboxes */}
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="mb-3 text-sm font-medium text-foreground/80">Delivery method</p>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sendEmail}
                    disabled={!contactEmail}
                    onCheckedChange={(checked) => toggleEmail(checked === true)}
                  />
                  <span>Email{!contactEmail ? " (no customer email)" : ""}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sendText}
                    disabled={!contactPhone}
                    onCheckedChange={(checked) => toggleText(checked === true)}
                  />
                  <span>Text{!contactPhone ? " (no customer phone)" : ""}</span>
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
                {loading ? primarySendingLabel : primarySendLabel}
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
              {postSendHeading} You can copy the link or message below.
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
