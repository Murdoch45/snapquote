"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  value: string;
  onAddressChange: (val: string) => void;
  onPlaceResolved: (payload: { placeId?: string; lat?: number; lng?: number }) => void;
};

declare global {
  interface Window {
    google?: any;
  }
}

export function AddressAutocomplete({
  value,
  onAddressChange,
  onPlaceResolved
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const key =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!key || !inputRef.current) return;
    if (window.google?.maps?.places) {
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "place_id", "geometry"],
        types: ["address"]
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        onAddressChange(place.formatted_address || inputRef.current?.value || "");
        onPlaceResolved({
          placeId: place.place_id,
          lat: place.geometry?.location?.lat?.(),
          lng: place.geometry?.location?.lng?.()
        });
      });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.onload = () => {
      if (!window.google?.maps?.places || !inputRef.current) return;
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "place_id", "geometry"],
        types: ["address"]
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        onAddressChange(place.formatted_address || inputRef.current?.value || "");
        onPlaceResolved({
          placeId: place.place_id,
          lat: place.geometry?.location?.lat?.(),
          lng: place.geometry?.location?.lng?.()
        });
      });
    };
    document.body.appendChild(script);
  }, [onAddressChange, onPlaceResolved]);

  return (
    <div className="space-y-2">
      <Label htmlFor="address">Address</Label>
      <Input
        id="address"
        ref={inputRef}
        value={value}
        required
        onChange={(e) => onAddressChange(e.target.value)}
        placeholder="123 Main St, City, State"
      />
    </div>
  );
}
