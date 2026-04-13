"use client";

import { SERVICE_OPTIONS, type ServiceType } from "@/lib/services";

type Props = {
  selectedServices: ServiceType[];
  onToggle: (service: ServiceType) => void;
  legend?: string;
  helperText?: string;
};

export function ServiceMultiSelectField({
  selectedServices,
  onToggle,
  legend = "Services",
  helperText = "Choose all that apply."
}: Props) {
  return (
    <fieldset className="space-y-3">
      <div className="space-y-1">
        <legend className="text-sm font-medium text-foreground">{legend}</legend>
        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SERVICE_OPTIONS.map((service) => {
          const selected = selectedServices.includes(service);
          return (
            <button
              key={service}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(service)}
              className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-900"
                  : "border-border bg-card text-foreground/80 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              {service}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
