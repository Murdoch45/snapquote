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
      <Label htmlFor={inputId}>{label}</Label>
      <select
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value as ServiceType | "")}
        className="flex h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-blue-100"
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
