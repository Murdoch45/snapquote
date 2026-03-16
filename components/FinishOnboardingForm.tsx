"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ServiceMultiSelectField } from "@/components/ServiceMultiSelectField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ServiceType } from "@/lib/services";
import { createClient } from "@/lib/supabase/client";

export function FinishOnboardingForm({
  initialServices = []
}: {
  initialServices?: ServiceType[];
}) {
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState<ServiceType[]>(initialServices);
  const [loading, setLoading] = useState(false);

  const toggleService = (service: ServiceType) => {
    setServices((current) =>
      current.includes(service) ? current.filter((item) => item !== service) : [...current, service]
    );
  };

  const onFinish = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (services.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first.");

      const res = await fetch("/api/public/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, phone, services })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to finish onboarding.");
      window.location.href = "/app";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Onboarding failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onFinish} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="onboarding-business">Business name</Label>
        <Input
          id="onboarding-business"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="onboarding-phone">Business phone (optional)</Label>
        <Input
          id="onboarding-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <ServiceMultiSelectField
        legend="Services offered"
        helperText="These services will be saved to your contractor profile."
        selectedServices={services}
        onToggle={toggleService}
      />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Finishing..." : "Finish onboarding"}
      </Button>
    </form>
  );
}
