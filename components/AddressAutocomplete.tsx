"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  value: string;
  onAddressChange: (val: string) => void;
  onPlaceResolved: (payload: { placeId?: string; lat?: number; lng?: number }) => void;
  helperText?: string;
  invalid?: boolean;
  label?: string;
  inputId?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

let googleMapsPlacesPromise: Promise<void> | null = null;

function loadGoogleMapsPlaces(key: string) {
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (googleMapsPlacesPromise) {
    return googleMapsPlacesPromise;
  }

  googleMapsPlacesPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }

      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps.")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.body.appendChild(script);
  });

  return googleMapsPlacesPromise;
}

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
  disabled = false
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
        await loadGoogleMapsPlaces(key);
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
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
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
        className={invalid ? "border-red-300 focus-visible:ring-red-200" : undefined}
      />
      <p className={`text-xs ${invalid || loadError ? "text-red-600" : "text-gray-500"}`}>
        {loadError || helperText || "Start typing and select an address from the dropdown."}
      </p>
    </div>
  );
}
