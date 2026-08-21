"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bike, Check, MapPin, Plus, Send, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";

type Rider = {
  id: string;
  phoneNumber?: string | null;
  status: string;
  serviceArea?: string | null;
  completedJobs: number;
  user: { name: string; email: string };
  vehicles: Array<{
    type: string;
    plateNumber?: string | null;
    model?: string | null;
    color?: string | null;
  }>;
  locations: Array<{ latitude: number; longitude: number; createdAt: string }>;
};

type DeliveryJob = {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedArrivalAt?: string | null;
  estimatedFare: number;
  finalFare?: number | null;
  requestedAt: string;
  order?: {
    orderNumber: string;
    customer: { name: string; phoneNumber?: string | null };
  } | null;
  rider?: {
    id: string;
    user: { name: string };
    vehicles: Array<{ plateNumber?: string | null }>;
  } | null;
};

type GooglePlaceResult = {
  formatted_address?: string;
  name?: string;
  geometry?: { location?: { lat: () => number; lng: () => number } };
};

type GoogleAutocomplete = {
  addListener: (eventName: "place_changed", callback: () => void) => void;
  getPlace: () => GooglePlaceResult;
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

const DEFAULT_PICKUP_COORDINATES = { latitude: 10.2760457, longitude: 123.8466921 };
const riderStatusOptions = ["Online", "Offline", "Busy", "Suspended"].map((label) => ({
  label,
  value: label.toLowerCase()
}));
const jobStatusOptions = [
  ["Accepted", "accepted"],
  ["Pickup Started", "pickup_started"],
  ["Picked Up", "picked_up"],
  ["Delivering", "delivering"],
  ["Delivered", "delivered"],
  ["Cancelled", "cancelled"]
].map(([label, value]) => ({ label, value }));

type Quote = {
  distanceKm: number | null;
  estimatedFare: number;
  estimatedDurationMinutes: number | null;
};

export function DispatcherBoard({
  initialRiders,
  initialJobs
}: {
  initialRiders: Rider[];
  initialJobs: DeliveryJob[];
}) {
  const [riders, setRiders] = useState(initialRiders);
  const [jobs, setJobs] = useState(initialJobs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [riderForm, setRiderForm] = useState({
    name: "",
    email: "",
    password: "",
    phoneNumber: "",
    serviceArea: "",
    vehicleType: "motorcycle",
    plateNumber: "",
    vehicleModel: "",
    vehicleColor: ""
  });
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCoordinates, setDropoffCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [jobQuote, setJobQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const onlineRiders = useMemo(
    () => riders.filter((rider) => rider.status === "online" || rider.status === "busy"),
    [riders]
  );

  async function reload() {
    const [nextRiders, nextJobs] = await Promise.all([
      apiFetch<Rider[]>("/delivery-network/riders"),
      apiFetch<DeliveryJob[]>("/delivery-network/jobs")
    ]);
    setRiders(nextRiders);
    setJobs(nextJobs);
  }

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delivery network action failed");
      }
    });
  }

  function createRider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      await apiFetch("/delivery-network/riders", {
        method: "POST",
        body: JSON.stringify(emptyToUndefined(riderForm))
      });
      setRiderForm({
        name: "",
        email: "",
        password: "",
        phoneNumber: "",
        serviceArea: "",
        vehicleType: "motorcycle",
        plateNumber: "",
        vehicleModel: "",
        vehicleColor: ""
      });
      await reload();
    });
  }

  async function quoteDelivery(place: { address: string; latitude: number; longitude: number }) {
    setError(null);
    setDropoffAddress(place.address);
    setDropoffCoordinates({ latitude: place.latitude, longitude: place.longitude });
    setJobQuote(null);
    setQuoting(true);

    try {
      const params = new URLSearchParams({
        pickupAddress: "Empanada Hauz",
        pickupLatitude: String(DEFAULT_PICKUP_COORDINATES.latitude),
        pickupLongitude: String(DEFAULT_PICKUP_COORDINATES.longitude),
        dropoffAddress: place.address,
        dropoffLatitude: String(place.latitude),
        dropoffLongitude: String(place.longitude)
      });
      const quote = await apiFetch<Quote>(`/delivery-network/quote?${params}`);
      setJobQuote(quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to calculate delivery quote");
    } finally {
      setQuoting(false);
    }
  }

  function updateRiderStatus(riderId: string, status: string) {
    run(async () => {
      await apiFetch(`/delivery-network/riders/${riderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await reload();
    });
  }

  function assignJob(jobId: string, riderId: string) {
    if (!riderId) return;
    run(async () => {
      await apiFetch(`/delivery-network/jobs/${jobId}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ riderId })
      });
      await reload();
    });
  }

  function updateJobStatus(jobId: string, status: string) {
    run(async () => {
      await apiFetch(`/delivery-network/jobs/${jobId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await reload();
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/55">Create rider accounts for your own fleet.</p>
              <h2 className="text-xl font-semibold">Riders</h2>
            </div>
            <UserPlus size={20} className="text-foreground/45" />
          </div>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createRider}>
            <Input placeholder="Rider name" value={riderForm.name} onChange={(e) => setRiderForm({ ...riderForm, name: e.target.value })} required />
            <Input placeholder="Email" type="email" value={riderForm.email} onChange={(e) => setRiderForm({ ...riderForm, email: e.target.value })} required />
            <Input placeholder="Temporary password" type="password" value={riderForm.password} onChange={(e) => setRiderForm({ ...riderForm, password: e.target.value })} required />
            <Input placeholder="Phone number" value={riderForm.phoneNumber} onChange={(e) => setRiderForm({ ...riderForm, phoneNumber: e.target.value })} />
            <Input placeholder="Service area" value={riderForm.serviceArea} onChange={(e) => setRiderForm({ ...riderForm, serviceArea: e.target.value })} />
            <Select
              value={riderForm.vehicleType}
              onChange={(vehicleType) => setRiderForm({ ...riderForm, vehicleType })}
              options={[
                { label: "Motorcycle", value: "motorcycle" },
                { label: "Bicycle", value: "bicycle" },
                { label: "Car", value: "car" }
              ]}
            />
            <Input placeholder="Plate number" value={riderForm.plateNumber} onChange={(e) => setRiderForm({ ...riderForm, plateNumber: e.target.value })} />
            <Input placeholder="Vehicle model" value={riderForm.vehicleModel} onChange={(e) => setRiderForm({ ...riderForm, vehicleModel: e.target.value })} />
            <Input placeholder="Vehicle color" value={riderForm.vehicleColor} onChange={(e) => setRiderForm({ ...riderForm, vehicleColor: e.target.value })} />
            <Button className="md:col-span-2" disabled={pending}>
              <Plus size={16} />
              Add Rider
            </Button>
          </form>
        </Card>

        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/55">Google Maps fills distance, fare, and ETA after you select a drop-off.</p>
              <h2 className="text-xl font-semibold">New Delivery Job</h2>
            </div>
            <Send size={20} className="text-foreground/45" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Pickup address"
              value="Empanada Hauz"
              disabled
              readOnly
              aria-label="Pickup address"
            />
            <PlacesAddressInput
              placeholder="Dropoff address"
              value={dropoffAddress}
              onChange={(value) => {
                setDropoffAddress(value);
                setDropoffCoordinates(null);
                setJobQuote(null);
                setError(null);
              }}
              onPlaceSelect={quoteDelivery}
              required
            />

            <div className="md:col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-line bg-black/10 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/45">Distance</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {quoting
                    ? "Calculating…"
                    : jobQuote?.distanceKm != null
                      ? `${jobQuote.distanceKm.toFixed(2)} km`
                      : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/45">Fare</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {quoting ? "Calculating…" : jobQuote ? `Php ${jobQuote.estimatedFare}` : "—"}
                </p>
              </div>
              <p className="col-span-2 text-xs text-foreground/40">
                {dropoffCoordinates
                  ? "Quote calculated from the selected drop-off address."
                  : "Select an address suggestion to calculate the distance and fare."}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Rider Fleet</h2>
          <Bike size={20} className="text-foreground/45" />
        </div>
        <Table className="min-w-[860px]">
          <thead>
            <tr>
              <Th>Rider</Th>
              <Th>Vehicle</Th>
              <Th>Area</Th>
              <Th>Last Location</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {riders.map((rider) => {
              const vehicle = rider.vehicles[0];
              const location = rider.locations[0];
              return (
                <tr key={rider.id}>
                  <Td>
                    <div className="font-medium">{rider.user.name}</div>
                    <div className="text-xs text-foreground/50">{rider.phoneNumber ?? rider.user.email}</div>
                  </Td>
                  <Td>{vehicle ? [vehicle.type, vehicle.plateNumber, vehicle.model].filter(Boolean).join(" | ") : "No vehicle"}</Td>
                  <Td>{rider.serviceArea ?? "Any area"}</Td>
                  <Td>{location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "No GPS yet"}</Td>
                  <Td className="min-w-[170px]">
                    <Select value={rider.status} onChange={(value) => updateRiderStatus(rider.id, value)} options={riderStatusOptions} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Dispatch Jobs</h2>
          <MapPin size={20} className="text-foreground/45" />
        </div>
        <Table className="min-w-[1240px]">
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>Pickup</Th>
              <Th>Dropoff</Th>
              <Th>Distance</Th>
              <Th>ETA</Th>
              <Th>Fare</Th>
              <Th>Rider</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <Td>
                  <div className="font-medium">{job.order?.orderNumber ?? job.id.slice(-8)}</div>
                  <div className="text-xs text-foreground/50">
                    {job.order?.customer.name ?? new Date(job.requestedAt).toLocaleString()}
                  </div>
                </Td>
                <Td>{job.pickupAddress}</Td>
                <Td>{job.dropoffAddress}</Td>
                <Td>{formatDistance(job.distanceKm)}</Td>
                <Td>{formatEta(job)}</Td>
                <Td>Php {job.finalFare ?? job.estimatedFare}</Td>
                <Td className="min-w-[210px]">
                  {job.rider ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Check size={16} className="text-success" />
                      {job.rider.user.name}
                    </div>
                  ) : (
                    <AssignSelect riders={onlineRiders} onAssign={(riderId) => assignJob(job.id, riderId)} />
                  )}
                </Td>
                <Td className="min-w-[190px]">
                  <Select value={job.status} onChange={(value) => updateJobStatus(job.id, value)} options={jobStatusOptions} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function PlacesAddressInput({
  placeholder,
  value,
  onChange,
  onPlaceSelect,
  required
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: { address: string; latitude: number; longitude: number }) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onPlaceSelectRef.current = onPlaceSelect;
  });

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let autocomplete: GoogleAutocomplete | null = null;

    const attachAutocomplete = () => {
      if (cancelled || !inputRef.current || autocomplete) return Boolean(autocomplete);
      const Autocomplete = (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
      if (!Autocomplete) return false;

      autocomplete = new Autocomplete(inputRef.current, {
        fields: ["formatted_address", "geometry", "name"],
        types: ["geocode", "establishment"],
        componentRestrictions: { country: "ph" }
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete?.getPlace();
        const location = place?.geometry?.location;
        const address = place?.formatted_address ?? place?.name ?? "";
        const latitude = location?.lat();
        const longitude = location?.lng();

        if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        onPlaceSelectRef.current({
          address,
          latitude: latitude as number,
          longitude: longitude as number
        });
      });

      document.querySelectorAll<HTMLElement>(".pac-container").forEach((container) => {
        container.style.zIndex = "99999";
      });

      return true;
    };

    const loadMapsScript = (apiKey: string) => {
      if (attachAutocomplete()) return;

      const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-places-dispatcher]");
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&region=PH`;
        script.async = true;
        script.defer = true;
        script.dataset.googlePlacesDispatcher = "true";
        script.addEventListener("load", () => attachAutocomplete(), { once: true });
        script.addEventListener("error", () => setLoadError(true), { once: true });
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
      try {
        const response = await fetch("/api/google-maps-key", { cache: "no-store" });
        if (!response.ok) throw new Error(`Google Maps key endpoint returned ${response.status}`);
        const data = (await response.json()) as { apiKey?: string };
        const apiKey = data.apiKey?.trim();
        if (!apiKey) throw new Error("Google Maps API key is not configured");
        if (!cancelled) loadMapsScript(apiKey);
      } catch (error) {
        if (!cancelled) {
          setLoadError(true);
          console.error("Empanada Hauz: unable to load Google Maps Places.", error);
        }
      }
    };

    void loadGooglePlaces();

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, []);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChangeRef.current(event.target.value)}
        required={required}
        autoComplete="off"
        aria-autocomplete="list"
      />
      {loadError ? <p className="mt-1 text-xs text-foreground/40">Address suggestions are unavailable.</p> : null}
    </div>
  );
}

function AssignSelect({ riders, onAssign }: { riders: Rider[]; onAssign: (riderId: string) => void }) {
  return (
    <Select
      value=""
      onChange={onAssign}
      options={[
        { label: riders.length ? "Assign rider…" : "No online riders", value: "" },
        ...riders.map((rider) => ({ label: rider.user.name, value: rider.id }))
      ]}
    />
  );
}

function formatDistance(distanceKm?: number | null) {
  return distanceKm == null ? "—" : `${distanceKm.toFixed(2)} km`;
}

function formatEta(job: DeliveryJob) {
  if (job.estimatedArrivalAt) return new Date(job.estimatedArrivalAt).toLocaleString();
  if (job.estimatedDurationMinutes != null) return `${job.estimatedDurationMinutes} min`;
  return "—";
}

function emptyToUndefined<T extends Record<string, string>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item.trim() || undefined]));
}
