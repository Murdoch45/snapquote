"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  CUSTOMER_NAME_TOKEN,
  QuoteTemplateEditor
} from "@/components/quote-template/QuoteTemplateEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_QUOTE_SMS_TEMPLATE } from "@/lib/quote-template";
import { type ServiceType } from "@/lib/services";

type SettingsData = {
  business_name: string;
  public_slug: string;
  phone: string | null;
  email: string | null;
  services: ServiceType[] | null;
  business_address_full: string | null;
  business_address_place_id: string | null;
  business_lat: number | null;
  business_lng: number | null;
  quote_sms_template: string | null;
  travel_pricing_disabled: boolean;
  notification_lead_sms: boolean;
  notification_lead_email: boolean;
  notification_accept_sms: boolean;
  notification_accept_email: boolean;
};

type SlugStatus =
  | { type: "idle"; message: string | null }
  | { type: "checking"; message: string }
  | { type: "available"; message: string }
  | { type: "taken"; message: string }
  | { type: "invalid"; message: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function getSlugValidationMessage(slug: string): string | null {
  if (!slug) return "Enter a public URL slug.";
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug !== slug.toLowerCase()) return "Use lowercase letters only.";
  if (slug.includes(" ")) return "Spaces are not allowed.";
  if (!SLUG_PATTERN.test(slug)) {
    return "Use only lowercase letters, numbers, and hyphens.";
  }

  return null;
}

function removeCustomerNameToken(template: string): string {
  return template
    .replaceAll(CUSTOMER_NAME_TOKEN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureCustomerNameToken(template: string): string {
  if (template.includes(CUSTOMER_NAME_TOKEN)) {
    return template;
  }

  return `${template}${template.length > 0 ? " " : ""}${CUSTOMER_NAME_TOKEN}`;
}

export function SettingsForm({ initial }: { initial: SettingsData }) {
  const initialTemplate = initial.quote_sms_template ?? DEFAULT_QUOTE_SMS_TEMPLATE;
  const [form, setForm] = useState({
    businessName: initial.business_name,
    publicSlug: initial.public_slug,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    businessAddressFull: initial.business_address_full ?? "",
    businessAddressPlaceId: initial.business_address_place_id ?? "",
    businessLat: initial.business_lat ?? null,
    businessLng: initial.business_lng ?? null,
    quoteSmsTemplate: initialTemplate,
    travelPricingDisabled: initial.travel_pricing_disabled,
    notificationLeadSms: initial.notification_lead_sms,
    notificationLeadEmail: initial.notification_lead_email,
    notificationAcceptSms: initial.notification_accept_sms,
    notificationAcceptEmail: initial.notification_accept_email
  });
  const [loading, setLoading] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ type: "idle", message: null });
  const [autoInsertCustomerName, setAutoInsertCustomerName] = useState(
    initialTemplate.includes(CUSTOMER_NAME_TOKEN)
  );

  const trimmedSlug = form.publicSlug.trim();
  const hasSelectedBusinessAddress = Boolean(
    form.businessAddressPlaceId &&
      form.businessAddressFull.trim().length >= 5 &&
      form.businessLat !== null &&
      form.businessLng !== null
  );

  useEffect(() => {
    const validationMessage = getSlugValidationMessage(trimmedSlug);

    if (validationMessage) {
      setSlugStatus({ type: "invalid", message: validationMessage });
      return;
    }

    if (trimmedSlug === initial.public_slug) {
      setSlugStatus({ type: "available", message: "This public URL is available." });
      return;
    }

    setSlugStatus({ type: "checking", message: "Checking availability..." });

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/app/settings/check-slug?slug=${encodeURIComponent(trimmedSlug)}`,
          {
            method: "GET",
            cache: "no-store"
          }
        );
        const json = (await response.json()) as { available?: boolean };

        if (cancelled) return;

        if (!response.ok || typeof json.available !== "boolean") {
          setSlugStatus({
            type: "invalid",
            message: "Unable to verify this public URL right now. Try again."
          });
          return;
        }

        setSlugStatus({
          type: json.available ? "available" : "taken",
          message: json.available
            ? "This public URL is available."
            : "This public URL is already taken."
        });
      } catch {
        if (!cancelled) {
          setSlugStatus({
            type: "invalid",
            message: "Unable to verify this public URL right now. Try again."
          });
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [trimmedSlug, initial.public_slug]);

  const handleBusinessAddressChange = (businessAddressFull: string) => {
    setForm((prev) => ({
      ...prev,
      businessAddressFull,
      businessAddressPlaceId: "",
      businessLat: null,
      businessLng: null
    }));
  };

  const handleCustomerNameToggle = (checked: boolean) => {
    setAutoInsertCustomerName(checked);
    setForm((prev) => ({
      ...prev,
      quoteSmsTemplate: checked
        ? ensureCustomerNameToken(prev.quoteSmsTemplate)
        : removeCustomerNameToken(prev.quoteSmsTemplate)
    }));
  };

  const submit = async () => {
    if (
      slugStatus.type === "invalid" ||
      slugStatus.type === "taken" ||
      slugStatus.type === "checking"
    ) {
      toast.error(slugStatus.message || "Enter a valid public URL.");
      return;
    }

    if (!form.travelPricingDisabled && !hasSelectedBusinessAddress) {
      toast.error("Select a valid business address or disable travel distance pricing.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/app/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          publicSlug: trimmedSlug,
          phone: form.phone,
          email: form.email,
          businessAddressFull: form.businessAddressFull,
          businessAddressPlaceId: form.businessAddressPlaceId,
          businessLat: form.businessLat,
          businessLng: form.businessLng,
          quoteSmsTemplate: form.quoteSmsTemplate,
          travelPricingDisabled: form.travelPricingDisabled,
          notificationLeadSms: form.notificationLeadSms,
          notificationLeadEmail: form.notificationLeadEmail,
          notificationAcceptSms: form.notificationAcceptSms,
          notificationAcceptEmail: form.notificationAcceptEmail
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed.");
      toast.success("Settings updated.");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Business Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="businessName"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
          >
            Business name
          </Label>
          <Input
            id="businessName"
            value={form.businessName}
            onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
            className="h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="phone"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
          >
            Phone
          </Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            className="h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label
            htmlFor="publicSlug"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
          >
            Public URL
          </Label>
          <Input
            id="publicSlug"
            value={form.publicSlug}
            onChange={(e) => setForm((prev) => ({ ...prev, publicSlug: e.target.value }))}
            aria-invalid={slugStatus.type === "invalid" || slugStatus.type === "taken"}
            className={
              slugStatus.type === "invalid" || slugStatus.type === "taken"
                ? "h-11 rounded-[8px] border-[#FECACA] bg-white px-[14px] text-sm text-[#111827] focus-visible:ring-[#DC2626]"
                : "h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] focus-visible:ring-[#2563EB]"
            }
          />
          <p className="text-sm text-[#6B7280]">
            Your public URL: snapquote.app/{trimmedSlug || "[your-slug]"}
          </p>
          <p
            className={`rounded-[8px] border px-4 py-3 text-sm ${
              slugStatus.type === "invalid" || slugStatus.type === "taken"
                ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                : slugStatus.type === "available"
                  ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]"
                  : "border-[#E5E7EB] bg-white text-[#6B7280]"
            }`}
          >
            {slugStatus.message || "Use lowercase letters, numbers, and hyphens only."}
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label
            htmlFor="email"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
          >
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
          />
        </div>
      </div>
      </section>

      <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Business Address</h2>
        <div className="space-y-3 rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] p-4">
        <div className="space-y-1">
          <p className="text-sm text-[#6B7280]">
            Used to estimate travel distance for new leads when mobile-only pricing is off.
          </p>
        </div>

        <AddressAutocomplete
          label="Business address"
          inputId="business-address"
          value={form.businessAddressFull}
          onAddressChange={handleBusinessAddressChange}
          onPlaceResolved={({ placeId, lat, lng }) =>
            setForm((prev) => ({
              ...prev,
              businessAddressPlaceId: placeId ?? "",
              businessLat: lat ?? null,
              businessLng: lng ?? null
            }))
          }
          required={!form.travelPricingDisabled}
          invalid={
            !form.travelPricingDisabled &&
            form.businessAddressFull.trim().length > 0 &&
            !hasSelectedBusinessAddress
          }
          helperText={
            form.travelPricingDisabled
              ? "Travel distance is disabled. You can leave this blank."
              : hasSelectedBusinessAddress
                ? "Google verified business address selected."
                : "Select your business address from the Google dropdown so travel can be calculated."
          }
        />

        <label className="flex items-start gap-2 text-sm text-[#111827]">
          <Checkbox
            className="mt-0.5 data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
            checked={form.travelPricingDisabled}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, travelPricingDisabled: checked === true }))
            }
          />
          <span>I operate mobile and do not want travel distance included in estimates.</span>
        </label>
        </div>
      </section>

      <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Notifications</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-[#111827]">
          <Checkbox
            className="data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
            checked={form.notificationLeadSms}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, notificationLeadSms: checked === true }))
            }
          />
          Lead notifications by SMS
        </label>

        <label className="flex items-center gap-2 text-sm text-[#111827]">
          <Checkbox
            className="data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
            checked={form.notificationLeadEmail}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, notificationLeadEmail: checked === true }))
            }
          />
          Lead notifications by email
        </label>

        <label className="flex items-center gap-2 text-sm text-[#111827]">
          <Checkbox
            className="data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
            checked={form.notificationAcceptSms}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, notificationAcceptSms: checked === true }))
            }
          />
          Acceptance notifications by SMS
        </label>

        <label className="flex items-center gap-2 text-sm text-[#111827]">
          <Checkbox
            className="data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
            checked={form.notificationAcceptEmail}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, notificationAcceptEmail: checked === true }))
            }
          />
          Acceptance notifications by email
        </label>
      </div>
      </section>

      <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Quote SMS Template</h2>
        <div className="space-y-2">
        <Label
          htmlFor="quoteSmsTemplate"
          className="mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
        >
          Quote SMS template
        </Label>
        <div className="space-y-3 rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] p-4">
          <label className="flex items-center gap-2 text-sm text-[#111827]">
            <Checkbox
              className="data-[state=checked]:border-[#2563EB] data-[state=checked]:bg-[#2563EB]"
              checked={autoInsertCustomerName}
              onCheckedChange={(checked) => handleCustomerNameToggle(checked === true)}
            />
            <span>Automatically insert customer&apos;s name into quote message</span>
          </label>

          {autoInsertCustomerName ? (
            <p className="rounded-[8px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#6B7280]">
              Drag the customer name chip anywhere inside the message to control where it appears.
            </p>
          ) : null}
        </div>

        <QuoteTemplateEditor
          id="quoteSmsTemplate"
          value={form.quoteSmsTemplate}
          onChange={(nextValue) =>
            setForm((prev) => ({
              ...prev,
              quoteSmsTemplate: autoInsertCustomerName
                ? ensureCustomerNameToken(nextValue)
                : removeCustomerNameToken(nextValue)
            }))
          }
        />

        <p className="rounded-[8px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#6B7280]">
          Supported variables: {`{{customer_name}}`}, {`{{company_name}}`}, {`{{quote_link}}`},{" "}
          {`{{contractor_phone}}`}, {`{{contractor_email}}`}
        </p>
        </div>
      </section>

      <Button
        onClick={submit}
        disabled={
          loading ||
          slugStatus.type === "invalid" ||
          slugStatus.type === "taken" ||
          slugStatus.type === "checking"
        }
      >
        {loading ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}
