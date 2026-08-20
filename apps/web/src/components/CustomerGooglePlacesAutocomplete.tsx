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

// Match the working delivery Drop-off selector: both fields should show
// address and establishment/POI suggestions while typing in the Philippines.
const CUSTOMER_INPUTS = [
  { placeholder: "Address", field: "address" as const, types: ["geocode", "establishment"] },
  { placeholder: "Landmark", field: "landmark" as const, types: ["geocode", "establishment"] }
];

export default function CustomerGooglePlacesAutocomplete() {
  useEffect(() => {
    if (window.location.pathname !== "/customer") return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let retryTimer: number | null = null;
    const attached = new WeakSet<HTMLInputElement>();

    const configureSuggestionContainer = () => {
      document.querySelectorAll<HTMLElement>(".pac-container").forEach((container) => {
        container.style.zIndex = "99999";
        container.style.position = "absolute";
      });
    };

    const attachAutocomplete = () => {
      const Autocomplete = (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
      if (cancelled || !Autocomplete) return false;

      for (const config of CUSTOMER_INPUTS) {
        const inputs = document.querySelectorAll<HTMLInputElement>(`input[placeholder="${config.placeholder}"]`);

        for (const input of inputs) {
          if (attached.has(input)) continue;
          attached.add(input);

          // Prevent browser autofill from inserting a saved address into the
          // landmark field. Google Places remains the source of suggestions.
          input.setAttribute("autocomplete", config.field === "landmark" ? "off" : "street-address");

          const autocomplete = new Autocomplete(input, {
            fields: ["formatted_address", "geometry", "name"],
            types: config.types,
            componentRestrictions: { country: "ph" }
          });

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const location = place.geometry?.location;
            const value = place.formatted_address ?? place.name ?? "";
            if (!value) return;

            // Keep the actual selected suggestion in the input, just like the
            // working delivery selector. Landmark is still allowed to contain
            // a place name or an address returned by Google.
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
      return true;
    };

    const loadGooglePlaces = () => {
      if (attachAutocomplete()) return;

      const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-places-customer]");
      if (existingScript) {
        existingScript.addEventListener("load", () => attachAutocomplete(), { once: true });
      } else {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&region=PH`;
        script.async = true;
        script.defer = true;
        script.dataset.googlePlacesCustomer = "true";
        script.addEventListener("load", () => attachAutocomplete(), { once: true });
        script.addEventListener("error", () => {
          // Keep retrying because the form can render before Google finishes loading.
        }, { once: true });
        document.head.appendChild(script);
      }

      let attempts = 0;
      const retry = () => {
        if (cancelled || attachAutocomplete() || attempts >= 40) return;
        attempts += 1;
        retryTimer = window.setTimeout(retry, 250);
      };
      retry();
    };

    loadGooglePlaces();

    observer = new MutationObserver(() => {
      attachAutocomplete();
      configureSuggestionContainer();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
