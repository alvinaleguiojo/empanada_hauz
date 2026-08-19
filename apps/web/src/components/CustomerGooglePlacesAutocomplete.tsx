"use client";

import { useEffect } from "react";

type GooglePlace = {
  formatted_address?: string;
  name?: string;
};

type GoogleAutocomplete = {
  addListener: (eventName: "place_changed", callback: () => void) => void;
  getPlace: () => GooglePlace;
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (
          input: HTMLInputElement,
          options: {
            fields: string[];
            types?: string[];
            componentRestrictions?: { country: string | string[] };
          }
        ) => GoogleAutocomplete;
      };
    };
  };
};

const CUSTOMER_INPUTS = ["Address", "Landmark"] as const;

export default function CustomerGooglePlacesAutocomplete() {
  useEffect(() => {
    if (window.location.pathname !== "/customer") return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    const attached = new WeakSet<HTMLInputElement>();

    const attachAutocomplete = () => {
      const Autocomplete = (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
      if (cancelled || !Autocomplete) return;

      for (const placeholder of CUSTOMER_INPUTS) {
        const inputs = document.querySelectorAll<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
        for (const input of inputs) {
          if (attached.has(input)) continue;
          attached.add(input);

          const autocomplete = new Autocomplete(input, {
            fields: ["formatted_address", "geometry", "name"],
            types: ["geocode", "establishment"],
            componentRestrictions: { country: "ph" }
          });

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const value = place.formatted_address ?? place.name;
            if (!value) return;

            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            setter?.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          });
        }
      }
    };

    const loadGooglePlaces = () => {
      const mapsWindow = window as GoogleMapsWindow;
      if (mapsWindow.google?.maps?.places?.Autocomplete) {
        attachAutocomplete();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-places]");
      if (existingScript) {
        existingScript.addEventListener("load", attachAutocomplete, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&region=PH`;
      script.async = true;
      script.defer = true;
      script.dataset.googlePlaces = "true";
      script.addEventListener("load", attachAutocomplete, { once: true });
      document.head.appendChild(script);
    };

    loadGooglePlaces();
    attachAutocomplete();

    observer = new MutationObserver(() => attachAutocomplete());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
