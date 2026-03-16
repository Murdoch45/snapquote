"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ServiceMultiSelectField } from "@/components/ServiceMultiSelectField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ServiceType } from "@/lib/services";
import { createClient } from "@/lib/supabase/client";

export function SignupForm({ initialServices = [] }: { initialServices?: ServiceType[] }) {
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [services, setServices] = useState<ServiceType[]>(initialServices);
  const [loading, setLoading] = useState(false);

  const toggleService = (service: ServiceType) => {
    setServices((current) =>
      current.includes(service) ? current.filter((item) => item !== service) : [...current, service]
    );
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (services.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
      if (error) throw error;

      if (!data.session) {
        toast.success("Check your email to verify account, then sign in.");
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/public/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, phone, services })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Onboarding failed.");

      window.location.href = "/app";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="business-name">Business name</Label>
        <Input
          id="business-name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-phone">Business phone (optional)</Label>
        <Input id="signup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <ServiceMultiSelectField
        legend="Services offered"
        helperText="These services will be saved to your contractor profile."
        selectedServices={services}
        onToggle={toggleService}
      />
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
