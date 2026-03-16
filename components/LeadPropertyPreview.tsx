"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  address: string;
  lat?: number | null;
  lng?: number | null;
};

type MapType = "roadmap" | "satellite";

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-javascript-api";

export function LeadPropertyPreview({ address, lat, lng }: Props) {
  const mapKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const [loadError, setLoadError] = useState(false);

  const googleMapsUrl = useMemo(() => {
    const query = lat != null && lng != null ? `${lat},${lng}` : address;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }, [address, lat, lng]);

  const initializeMap = useCallback(() => {
    if (lat == null || lng == null || !mapElementRef.current || !window.google?.maps) {
      setLoadError(true);
      return;
    }

    try {
      const center = { lat, lng };

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.google.maps.Map(mapElementRef.current, {
          center,
          zoom: 19,
          mapTypeId: mapType,
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true
        });

        markerRef.current = new window.google.maps.Marker({
          position: center,
          map: mapInstanceRef.current
        });
      } else {
        mapInstanceRef.current.setOptions({
          center,
          mapTypeId: mapType
        });
        mapInstanceRef.current.panTo(center);
        markerRef.current?.setPosition(center);
      }

      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [lat, lng, mapType]);

  useEffect(() => {
    if (window.google?.maps && !loadError) {
      initializeMap();
    }
  }, [initializeMap, loadError]);

  const showFallback = !mapKey || lat == null || lng == null || loadError;

  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-gray-700">{address}</p>

      {mapKey ? (
        <Script
          id={GOOGLE_MAPS_SCRIPT_ID}
          src={`https://maps.googleapis.com/maps/api/js?key=${mapKey}&v=weekly`}
          strategy="afterInteractive"
          onReady={initializeMap}
          onError={() => setLoadError(true)}
        />
      ) : null}

      {showFallback ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Interactive map unavailable. Check `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and that the
            Google Maps JavaScript API is enabled.
          </p>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Open in Google Maps
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Property Map
            </p>
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setMapType("roadmap")}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  mapType === "roadmap"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Map
              </button>
              <button
                type="button"
                onClick={() => setMapType("satellite")}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  mapType === "satellite"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Satellite
              </button>
            </div>
          </div>
          <div ref={mapElementRef} className="h-80 w-full bg-gray-100" />
        </div>
      )}
    </div>
  );
}
