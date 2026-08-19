"use client";

import { useEffect } from "react";

type GooglePlace = {
  formatted_address?: string;
  name?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
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

type CustomerPlaceSelectedDetail = {
  field: "address" | "landmark";
  value: string;
  formattedAddress?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
};

const CUSTOMER_INPUTS = [
  { placeholder: "Address", field: "address" as const, types: ["geocode", "establishment"] },
  { placeholder: "Landmark", field: "landmark" as const, types: ["establishment"] }
];

export default function CustomerGooglePlacesAutocomplete() {
  useEffect(() => {
    if (window.location.pathname !== "/customer") return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    const attached = new WeakSet<HTMLInputElement>();

    const configureSuggestionContainer = () => {
      document.querySelectorAll<HTMLElement>(".pac-container").forEach((container) => {
        container.style.zIndex = "99999";
      });
    };

    const attachAutocomplete = () => {
      const Autocomplete = (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
      if (cancelled || !Autocomplete) return;

      for (const config of CUSTOMER_INPUTS) {
        const inputs = document.querySelectorAll<HTMLInputElement>(`input[placeholder="${config.placeholder}"]`);

        for (const input of inputs) {
          if (attached.has(input)) continue;
          attached.add(input);

          // Prevent browser address autofill from copying a full address into
          // the landmark field. Google Places remains the source of truth.
          input.setAttribute("autocomplete", config.field === "landmark" ? "off" : "street-address");

          const autocomplete = new Autocomplete(input, {
            fields: ["formatted_address", "geometry", "name"],
            types: config.types,
            componentRestrictions: { country: "ph" }
          });

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const location = place.geometry?.location;

            // Address should prefer Google's full formatted address.
            // Landmark should prefer the POI/place name (e.g. "Gaisano Tabunok")
            // instead of replacing it with another full street address.
            const value = config.field === "landmark"
              ? (place.name ?? place.formatted_address ?? "")
              : (place.formatted_address ?? place.name ?? "");

            if (!value) return;

            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            setter?.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));

            const detail: CustomerPlaceSelectedDetail = {
              field: config.field,
              value,
              formattedAddress: place.formatted_address,
              name: place.name,
              latitude: location?.lat(),
              longitude: location?.lng()
            };

            window.dispatchEvent(new CustomEvent<CustomerPlaceSelectedDetail>("customer-place-selected", { detail }));
          });
        }
      }

      configureSuggestionContainer();
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
      script.addEventListener("error", () => {
        // Keep the form usable even when Places fails to load.
      }, { once: true });
      document.head.appendChild(script);
    };

    loadGooglePlaces();
    attachAutocomplete();

    observer = new MutationObserver(() => {
      attachAutocomplete();
      configureSuggestionContainer();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
