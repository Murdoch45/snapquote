"use client";

declare global {
  interface Window {
    google?: any;
    __snapquoteGoogleMapsLoaded?: boolean;
    __snapquoteGoogleMapsPromise?: Promise<void>;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = "snapquote-google-maps-api";

export function loadGoogleMaps(key: string): Promise<void> {
  if (window.google?.maps || window.__snapquoteGoogleMapsLoaded) {
    window.__snapquoteGoogleMapsLoaded = true;
    return Promise.resolve();
  }

  if (window.__snapquoteGoogleMapsPromise) {
    return window.__snapquoteGoogleMapsPromise;
  }

  window.__snapquoteGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      if (existingScript.dataset.loaded === "true" || window.google?.maps) {
        window.__snapquoteGoogleMapsLoaded = true;
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      window.__snapquoteGoogleMapsLoaded = true;
      resolve();
    };
    script.onerror = () => {
      window.__snapquoteGoogleMapsLoaded = false;
      window.__snapquoteGoogleMapsPromise = undefined;
      reject(new Error("Failed to load Google Maps."));
    };
    document.body.appendChild(script);
  });

  return window.__snapquoteGoogleMapsPromise;
}
