"use client";

import { Label } from "@/components/ui/label";
import { SERVICE_OPTIONS, type ServiceType } from "@/lib/services";

type Props = {
  value: ServiceType | "";
  onChange: (service: ServiceType | "") => void;
  inputId?: string;
  label?: string;
};

export function ServiceSelector({
  value,
  onChange,
  inputId = "service",
  label = "Service"
}: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="mb-1.5 block text-[13px] font-semibold text-foreground">
        {label}
      </Label>
      <select
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value as ServiceType | "")}
        className="flex w-full rounded-[8px] border border-border bg-card px-[14px] py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-[rgba(37,99,235,0.1)]"
        required
      >
        <option value="">Select a service</option>
        {SERVICE_OPTIONS.map((service) => (
          <option key={service} value={service}>
            {service}
          </option>
        ))}
      </select>
    </div>
  );
}
