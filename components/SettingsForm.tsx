"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SettingsData = {
  business_name: string;
  public_slug: string;
  phone: string | null;
  email: string | null;
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
    notificationLeadSms: initial.notification_lead_sms,
    notificationLeadEmail: initial.notification_lead_email,
    notificationAcceptSms: initial.notification_accept_sms,
    notificationAcceptEmail: initial.notification_accept_email
  });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
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
      <Button onClick={submit} disabled={loading}>
        {loading ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}
