"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadGoogleMaps } from "@/lib/googleMaps";

type Props = {
  value: string;
  onAddressChange: (val: string) => void;
  onPlaceResolved: (payload: { placeId?: string; lat?: number; lng?: number }) => void;
  helperText?: string;
  invalid?: boolean;
  label?: React.ReactNode;
  inputId?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  variant?: "default" | "public";
};

export function AddressAutocomplete({
  value,
  onAddressChange,
  onPlaceResolved,
  helperText,
  invalid = false,
  label = "Address",
  inputId = "address",
  placeholder = "123 Main St, City, State",
  required = true,
  disabled = false,
  variant = "default"
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onAddressChangeRef = useRef(onAddressChange);
  const onPlaceResolvedRef = useRef(onPlaceResolved);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onAddressChangeRef.current = onAddressChange;
  }, [onAddressChange]);

  useEffect(() => {
    onPlaceResolvedRef.current = onPlaceResolved;
  }, [onPlaceResolved]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !inputRef.current) return;

    let isCancelled = false;
    let listener: { remove?: () => void } | undefined;

    const initAutocomplete = async () => {
      try {
        await loadGoogleMaps(key);
        if (isCancelled || !window.google?.maps?.places || !inputRef.current) return;

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "place_id", "geometry"],
          types: ["address"]
        });

        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const formattedAddress = place.formatted_address || inputRef.current?.value || "";
          onAddressChangeRef.current(formattedAddress);
          onPlaceResolvedRef.current({
            placeId: place.place_id,
            lat: place.geometry?.location?.lat?.(),
            lng: place.geometry?.location?.lng?.()
          });
        });
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load Google Maps.");
      }
    };

    void initAutocomplete();

    return () => {
      isCancelled = true;
      listener?.remove?.();
    };
  }, []);

  return (
    <div className="min-w-0 max-w-full space-y-2">
      <Label
        htmlFor={inputId}
        className={
          variant === "public"
            ? "mb-1.5 block text-[13px] font-semibold text-foreground"
            : "mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground"
        }
      >
        {label}
      </Label>
      <Input
        id={inputId}
        ref={inputRef}
        value={value}
        required={required}
        disabled={disabled}
        autoComplete="street-address"
        onChange={(e) => {
          onAddressChange(e.target.value);
          onPlaceResolved({});
        }}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={
          variant === "public"
            ? invalid
              ? "h-auto rounded-[8px] border-[#DC2626] bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(220,38,38,0.12)]"
              : "h-auto rounded-[8px] border-border bg-card px-[14px] py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgba(37,99,235,0.1)]"
            : invalid
              ? "h-11 rounded-[8px] border-red-200 dark:border-red-800 bg-card px-[14px] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-[#DC2626]"
              : "h-11 rounded-[8px] border-border bg-card px-[14px] text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
        }
      />
      <p
        className={
          variant === "public"
            ? `max-w-full break-words text-xs ${invalid || loadError ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`
            : `rounded-[8px] border px-4 py-3 text-sm ${
                invalid || loadError
                  ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                  : "border-border bg-card text-muted-foreground"
              }`
        }
      >
        {loadError || helperText || "Start typing and select an address from the dropdown."}
      </p>
    </div>
  );
}
