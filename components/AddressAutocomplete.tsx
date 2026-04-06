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
            ? "mb-1.5 block text-[13px] font-semibold text-[#374151]"
            : "mb-1.5 block text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]"
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
              ? "h-auto rounded-[8px] border-[#DC2626] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(220,38,38,0.12)]"
              : "h-auto rounded-[8px] border-[#E5E7EB] bg-white px-[14px] py-3 text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[rgba(37,99,235,0.1)]"
            : invalid
              ? "h-11 rounded-[8px] border-[#FECACA] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#DC2626]"
              : "h-11 rounded-[8px] border-[#E5E7EB] bg-white px-[14px] text-sm text-[#111827] placeholder:text-[#6B7280] focus-visible:ring-[#2563EB]"
        }
      />
      <p
        className={
          variant === "public"
            ? `max-w-full break-words text-xs ${invalid || loadError ? "text-[#DC2626]" : "text-[#6B7280]"}`
            : `rounded-[8px] border px-4 py-3 text-sm ${
                invalid || loadError
                  ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                  : "border-[#E5E7EB] bg-white text-[#6B7280]"
              }`
        }
      >
        {loadError || helperText || "Start typing and select an address from the dropdown."}
      </p>
    </div>
  );
}
