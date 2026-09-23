"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LocateFixed, MapPin, Navigation, RefreshCw, Truck } from "lucide-react";
import { API_URL } from "@/lib/config";

type Quote = {
  distanceKm: number | null;
  estimatedDurationMinutes: number | null;
  estimatedArrivalAt: string | null;
  estimatedFare: number;
};

type LocationState = {
  latitude: number;
  longitude: number;
  label: string;
};

export default function DeliveryFeeChecker() {
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [location, setLocation] = useState<LocationState | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [lastCheckedAddress, setLastCheckedAddress] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  const checkFee = async () => {
    const trimmedAddress = address.trim();
    const trimmedLandmark = landmark.trim();

    if (!trimmedAddress && !location) {
      setError("Enter your delivery address or use your current location.");
      setQuote(null);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (location) {
        params.set("address", location.label);
        params.set("latitude", String(location.latitude));
        params.set("longitude", String(location.longitude));
      } else {
        params.set("address", trimmedAddress);
      }

      if (trimmedLandmark) params.set("landmark", trimmedLandmark);

      const response = await fetch(
        `${API_URL}/orders/delivery-quote?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | Quote
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload &&
            "message" in payload &&
            typeof payload.message === "string"
            ? payload.message
            : "We couldn't calculate the delivery fee right now."
        );
      }

      const nextQuote = payload as Quote;

      if (
        nextQuote.distanceKm == null ||
        !Number.isFinite(Number(nextQuote.estimatedFare))
      ) {
        throw new Error(
          "We couldn't find a drivable route to that location. Try a more complete address or nearby landmark."
        );
      }

      setQuote(nextQuote);
      setLastCheckedAddress(location?.label ?? trimmedAddress);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;

      setQuote(null);
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't calculate the delivery fee right now."
      );
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location access. Please enter your address instead.");
      return;
    }

    setLocating(true);
    setError("");
    setQuote(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "Current location"
        };

        setLocation(nextLocation);
        setAddress("Current location");
        setLocating(false);
      },
      (geoError) => {
        setLocating(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location access was denied. You can still enter your address manually."
            : "We couldn't read your current location. Please enter your address manually."
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    if (location && value !== location.label) {
      setLocation(null);
    }
    setQuote(null);
    setError("");
  };

  const handleReset = () => {
    requestRef.current?.abort();
    setAddress("");
    setLandmark("");
    setLocation(null);
    setQuote(null);
    setError("");
    setLastCheckedAddress("");
    setLoading(false);
  };

  return (
    <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-3xl border border-[#F2E8D5]/10 bg-[#241c13]/75 p-5 shadow-[0_24px_70px_-35px_rgba(0,0,0,.8)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#C0472B]/15 text-[#E3A64B]">
            <Truck size={21} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E3A64B]">
              Delivery fee checker
            </p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
              Check your delivery fee before ordering
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#F2E8D5]/62">
              Enter your destination and we'll calculate an estimated route-based
              delivery fee from Empanada Hauz.
            </p>
          </div>
        </div>

        <div className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#F2E8D5]/52">
              Delivery address
            </span>
            <div className="relative">
              <MapPin
                size={17}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#E3A64B]"
              />
              <input
                value={address}
                onChange={(event) => handleAddressChange(event.target.value)}
                placeholder="Address"
                autoComplete="off"
                className="min-h-14 w-full rounded-2xl border border-[#F2E8D5]/10 bg-[#17110b] pl-11 pr-4 text-sm text-[#F6EFDD] outline-none transition placeholder:text-[#F2E8D5]/28 focus:border-[#E3A64B]/55"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#F2E8D5]/52">
              Landmark
              <span className="ml-1 font-normal normal-case tracking-normal text-[#F2E8D5]/30">
                optional
              </span>
            </span>
            <div className="relative">
              <Navigation
                size={17}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#F2E8D5]/45"
              />
              <input
                value={landmark}
                onChange={(event) => {
                  setLandmark(event.target.value);
                  setQuote(null);
                  setError("");
                }}
                placeholder="Landmark"
                autoComplete="off"
                className="min-h-14 w-full rounded-2xl border border-[#F2E8D5]/10 bg-[#17110b] pl-11 pr-4 text-sm text-[#F6EFDD] outline-none transition placeholder:text-[#F2E8D5]/28 focus:border-[#E3A64B]/55"
              />
            </div>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating || loading}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[#F2E8D5]/10 bg-[#F2E8D5]/[0.04] px-4 text-sm font-bold text-[#F2E8D5] transition hover:bg-[#F2E8D5]/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locating ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <LocateFixed size={17} />
              )}
              {locating ? "Finding location…" : "Use my current location"}
            </button>

            <button
              type="button"
              onClick={() => void checkFee()}
              disabled={loading || locating || (!address.trim() && !location)}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#C0472B] px-4 text-sm font-extrabold uppercase tracking-[0.05em] text-white shadow-[0_12px_28px_-15px_rgba(192,71,43,.95)] transition hover:bg-[#d05336] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <Truck size={17} />
              )}
              {loading ? "Calculating…" : "Check delivery fee"}
            </button>
          </div>

          {location ? (
            <p className="rounded-2xl border border-[#7A9B4E]/25 bg-[#7A9B4E]/10 px-4 py-3 text-xs leading-5 text-[#c9dba6]">
              Using your device location for the route calculation. Your coordinates
              are only sent with this delivery quote request.
            </p>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-[#C0472B]/35 bg-[#C0472B]/10 px-4 py-4 text-sm leading-6 text-[#f0a894]">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="rounded-3xl border border-[#F2E8D5]/10 bg-[#F3EBDD] p-5 text-[#241c13] sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#241c13]/45">
          Estimated delivery
        </p>

        {quote ? (
          <>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-[family-name:var(--font-mono)] text-4xl font-bold">
                  ₱{Math.ceil(Number(quote.estimatedFare)).toLocaleString("en-PH")}
                </p>
                <p className="mt-1 text-sm text-[#241c13]/52">estimated delivery fee</p>
              </div>
              <span className="rounded-full bg-[#7A9B4E]/15 px-3 py-1.5 text-xs font-bold text-[#4f6a34]">
                Route found
              </span>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <Metric
                label="Distance"
                value={`${Number(quote.distanceKm).toFixed(1)} km`}
              />
              <Metric
                label="Estimated time"
                value={
                  quote.estimatedDurationMinutes
                    ? `${quote.estimatedDurationMinutes} min`
                    : "—"
                }
              />
            </div>

            <div className="mt-4 rounded-2xl border border-[#241c13]/10 bg-[#241c13]/[0.04] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#241c13]/40">
                Destination
              </p>
              <p className="mt-2 text-sm font-semibold leading-6">
                {lastCheckedAddress || "Your selected location"}
              </p>
              {quote.estimatedArrivalAt ? (
                <p className="mt-2 text-xs leading-5 text-[#241c13]/48">
                  Route estimate updated {formatDate(quote.estimatedArrivalAt)}.
                </p>
              ) : null}
            </div>

            <p className="mt-4 text-xs leading-5 text-[#241c13]/45">
              This is an estimate based on the available route and delivery pricing
              settings. The final delivery charge may change slightly if the route,
              address, or delivery arrangement changes.
            </p>

            <div className="mt-5 grid gap-2.5">
              <Link
                href="/order"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#C0472B] px-4 text-sm font-extrabold uppercase tracking-[0.05em] text-white transition hover:bg-[#d05336]"
              >
                Order now
              </Link>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#241c13]/10 bg-[#241c13]/[0.04] px-4 text-sm font-bold text-[#241c13] transition hover:bg-[#241c13]/[0.08]"
              >
                Check another location
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[#241c13]/15 bg-[#241c13]/[0.035] p-6">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#C0472B]/10 text-[#C0472B]">
              <MapPin size={21} />
            </div>
            <p className="mt-4 text-lg font-bold">Your delivery fee will appear here.</p>
            <p className="mt-2 text-sm leading-6 text-[#241c13]/55">
              Choose a destination above, then tap <strong>Check delivery fee</strong>.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#241c13]/10 bg-[#241c13]/[0.04] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#241c13]/40">
        {label}
      </p>
      <p className="mt-1.5 font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "now";
  }
}
