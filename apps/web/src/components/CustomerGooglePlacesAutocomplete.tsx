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
  { placeholder: "Address", field: "address" as const },
  { placeholder: "Landmark", field: "landmark" as const }
];

export default function CustomerGooglePlacesAutocomplete() {
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    const attached = new WeakSet<HTMLInputElement>();

    const configureSuggestionContainer = () => {
      document.querySelectorAll<HTMLElement>(".pac-container").forEach((container) => {
        container.style.zIndex = "99999";
      });
    };

    const attachAutocomplete = () => {
      const Autocomplete = (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
      if (cancelled || !Autocomplete) return false;

      for (const config of CUSTOMER_INPUTS) {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          `input[placeholder="${config.placeholder}"]`
        );

        for (const input of inputs) {
          if (attached.has(input)) continue;
          attached.add(input);

          input.setAttribute("autocomplete", "off");
          input.setAttribute("aria-autocomplete", "list");

          const autocomplete = new Autocomplete(input, {
            fields: ["formatted_address", "geometry", "name"],
            types: ["geocode", "establishment"],
            componentRestrictions: { country: "ph" }
          });

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const location = place.geometry?.location;
            const value = place.formatted_address ?? place.name ?? "";
            if (!value) return;

            const latitude = location?.lat();
            const longitude = location?.lng();

            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value"
            )?.set;
            setter?.call(input, value);

            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
              input.dataset.latitude = String(latitude);
              input.dataset.longitude = String(longitude);
              input.dataset.placeValue = selectedValue;
            } else {
              delete input.dataset.latitude;
              delete input.dataset.longitude;
              delete input.dataset.placeValue;
            }

            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));

            window.dispatchEvent(
              new CustomEvent<CustomerPlaceSelectedDetail>("customer-place-selected", {
                detail: {
                  field: config.field,
                  value: selectedValue,
                  formattedAddress: place.formatted_address,
                  name: place.name,
                  latitude,
                  longitude
                }
              })
            );
          });
        }
      }

      configureSuggestionContainer();
      return true;
    };

    const loadMapsScript = (apiKey: string) => {
      if (attachAutocomplete()) return;

      const existingCustomerScript = document.querySelector<HTMLScriptElement>(
        "script[data-google-places-customer]"
      );

      if (!existingCustomerScript) {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&region=PH`;
        script.async = true;
        script.defer = true;
        script.dataset.googlePlacesCustomer = "true";
        script.addEventListener("load", () => attachAutocomplete(), { once: true });
        script.addEventListener("error", () => {
          console.error("Empanada Hauz: Google Maps Places script failed to load.");
        }, { once: true });
        document.head.appendChild(script);
      }

      let attempts = 0;
      const retry = () => {
        if (cancelled || attachAutocomplete() || attempts >= 120) return;
        attempts += 1;
        retryTimer = window.setTimeout(retry, 250);
      };
      retry();
    };

    const loadGooglePlaces = async () => {
      // The Google Maps browser key is intentionally delivered by the
      // server route. Do not use NEXT_PUBLIC_GOOGLE_MAPS_API_KEY here:
      // keeping the configuration server-side avoids baking the key into
      // the Next.js client bundle.
      let apiKey: string | undefined;

      try {
        const response = await fetch("/api/google-maps-key", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Google Maps key endpoint returned ${response.status}`);
        }
        const data = (await response.json()) as { apiKey?: string };
        apiKey = data.apiKey?.trim();
      } catch (error) {
        console.error("Empanada Hauz: unable to load Google Maps API key.", error);
        return;
      }

      if (!apiKey || cancelled) {
        console.error("Empanada Hauz: Google Maps API key is not configured on the server.");
        return;
      }

      loadMapsScript(apiKey);
    };

    void loadGooglePlaces();

    const observer = new MutationObserver(() => {
      attachAutocomplete();
      configureSuggestionContainer();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
