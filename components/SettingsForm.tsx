"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ServiceMultiSelectField } from "@/components/ServiceMultiSelectField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ServiceType } from "@/lib/services";
import { DEFAULT_QUOTE_SMS_TEMPLATE } from "@/lib/quote-template";

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

export function SettingsForm({ initial }: { initial: SettingsData }) {
  const [form, setForm] = useState({
    businessName: initial.business_name,
    publicSlug: initial.public_slug,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    services: initial.services ?? [],
    businessAddressFull: initial.business_address_full ?? "",
    businessAddressPlaceId: initial.business_address_place_id ?? "",
    businessLat: initial.business_lat ?? null,
    businessLng: initial.business_lng ?? null,
    quoteSmsTemplate: initial.quote_sms_template ?? DEFAULT_QUOTE_SMS_TEMPLATE,
    travelPricingDisabled: initial.travel_pricing_disabled,
    notificationLeadSms: initial.notification_lead_sms,
    notificationLeadEmail: initial.notification_lead_email,
    notificationAcceptSms: initial.notification_accept_sms,
    notificationAcceptEmail: initial.notification_accept_email
  });
  const [loading, setLoading] = useState(false);

  const toggleService = (service: ServiceType) => {
    setForm((current) => ({
      ...current,
      services: current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service]
    }));
  };

  const hasSelectedBusinessAddress = Boolean(
    form.businessAddressPlaceId &&
      form.businessAddressFull.trim().length >= 5 &&
      form.businessLat !== null &&
      form.businessLng !== null
  );

  const handleBusinessAddressChange = (businessAddressFull: string) => {
    setForm((prev) => ({
      ...prev,
      businessAddressFull,
      businessAddressPlaceId: "",
      businessLat: null,
      businessLng: null
    }));
  };

  const submit = async () => {
    if (form.services.length === 0) {
      toast.error("Select at least one service.");
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
        body: JSON.stringify(form)
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
    <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            value={form.businessName}
            onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="publicSlug">Public slug</Label>
          <Input
            id="publicSlug"
            value={form.publicSlug}
            onChange={(e) => setForm((p) => ({ ...p, publicSlug: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </div>
      </div>
      <ServiceMultiSelectField
        legend="Services offered"
        helperText="These services are shown internally and used to keep your profile aligned with lead intake."
        selectedServices={form.services}
        onToggle={toggleService}
      />
      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900">Business Address</h3>
          <p className="text-xs text-gray-500">
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
          invalid={!form.travelPricingDisabled && form.businessAddressFull.trim().length > 0 && !hasSelectedBusinessAddress}
          helperText={
            form.travelPricingDisabled
              ? "Travel distance is disabled. You can leave this blank."
              : hasSelectedBusinessAddress
                ? "Google verified business address selected."
                : "Select your business address from the Google dropdown so travel can be calculated."
          }
        />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={form.travelPricingDisabled}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, travelPricingDisabled: checked === true }))
            }
          />
          <span>I operate mobile and do not want travel distance included in estimates.</span>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.notificationLeadSms}
            onCheckedChange={(checked) =>
              setForm((p) => ({ ...p, notificationLeadSms: checked === true }))
            }
          />
          Lead notifications by SMS
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.notificationLeadEmail}
            onCheckedChange={(checked) =>
              setForm((p) => ({ ...p, notificationLeadEmail: checked === true }))
            }
          />
          Lead notifications by email
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.notificationAcceptSms}
            onCheckedChange={(checked) =>
              setForm((p) => ({ ...p, notificationAcceptSms: checked === true }))
            }
          />
          Acceptance notifications by SMS
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.notificationAcceptEmail}
            onCheckedChange={(checked) =>
              setForm((p) => ({ ...p, notificationAcceptEmail: checked === true }))
            }
          />
          Acceptance notifications by email
        </label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="quoteSmsTemplate">Quote SMS template</Label>
        <Textarea
          id="quoteSmsTemplate"
          value={form.quoteSmsTemplate}
          onChange={(e) => setForm((p) => ({ ...p, quoteSmsTemplate: e.target.value }))}
          rows={10}
        />
        <p className="text-xs text-gray-500">
          Supported variables: {`{{customer_name}}`}, {`{{company_name}}`}, {`{{quote_link}}`},{" "}
          {`{{contractor_phone}}`}, {`{{contractor_email}}`}
        </p>
      </div>
      <Button onClick={submit} disabled={loading}>
        {loading ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}
