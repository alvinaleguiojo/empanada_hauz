"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bike, Check, MapPin, Plus, Send, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";

type Rider = { id: string; phoneNumber?: string | null; status: string; serviceArea?: string | null; completedJobs: number; user: { name: string; email: string }; vehicles: Array<{ type: string; plateNumber?: string | null; model?: string | null; color?: string | null }>; locations: Array<{ latitude: number; longitude: number; createdAt: string }> };
type DeliveryJob = { id: string; status: string; pickupAddress: string; dropoffAddress: string; distanceKm?: number | null; estimatedDurationMinutes?: number | null; estimatedArrivalAt?: string | null; estimatedFare: number; finalFare?: number | null; requestedAt: string; order?: { orderNumber: string; customer: { name: string; phoneNumber?: string | null } } | null; rider?: { id: string; user: { name: string }; vehicles: Array<{ plateNumber?: string | null }> } | null };
type GooglePlaceResult = { formatted_address?: string; name?: string; geometry?: { location?: { lat: () => number; lng: () => number } } };
type GoogleAutocomplete = { addListener: (eventName: "place_changed", callback: () => void) => void; getPlace: () => GooglePlaceResult };
type GoogleMapsWindow = Window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, options: { fields: string[]; types?: string[]; componentRestrictions?: { country: string | string[] } }) => GoogleAutocomplete } } } };

const DEFAULT_PICKUP_COORDINATES = { latitude: 10.2760457, longitude: 123.8466921 };
const riderStatusOptions = ["Online", "Offline", "Busy", "Suspended"].map((label) => ({ label, value: label.toLowerCase() }));
const jobStatusOptions = [["Accepted", "accepted"], ["Pickup Started", "pickup_started"], ["Picked Up", "picked_up"], ["Delivering", "delivering"], ["Delivered", "delivered"], ["Cancelled", "cancelled"]].map(([label, value]) => ({ label, value }));

export function DispatcherBoard({ initialRiders, initialJobs }: { initialRiders: Rider[]; initialJobs: DeliveryJob[] }) {
  const [riders, setRiders] = useState(initialRiders);
  const [jobs, setJobs] = useState(initialJobs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [riderForm, setRiderForm] = useState({ name: "", email: "", password: "", phoneNumber: "", serviceArea: "", vehicleType: "motorcycle", plateNumber: "", vehicleModel: "", vehicleColor: "" });
  const [jobForm, setJobForm] = useState({ pickupAddress: "Empanada Hauz", pickupLatitude: String(DEFAULT_PICKUP_COORDINATES.latitude), pickupLongitude: String(DEFAULT_PICKUP_COORDINATES.longitude), dropoffAddress: "", dropoffLatitude: "", dropoffLongitude: "", notes: "" });
  const [jobQuote, setJobQuote] = useState<{ distanceKm: number | null; estimatedFare: number; estimatedDurationMinutes: number | null } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const onlineRiders = useMemo(() => riders.filter((rider) => rider.status === "online" || rider.status === "busy"), [riders]);

  useEffect(() => {
    if (jobForm.pickupAddress.trim().toLowerCase() === "empanada hauz") setJobForm((current) => ({ ...current, pickupLatitude: String(DEFAULT_PICKUP_COORDINATES.latitude), pickupLongitude: String(DEFAULT_PICKUP_COORDINATES.longitude) }));
  }, [jobForm.pickupAddress]);

  useEffect(() => {
    const pickupLat = Number(jobForm.pickupLatitude), pickupLng = Number(jobForm.pickupLongitude), dropoffLat = Number(jobForm.dropoffLatitude), dropoffLng = Number(jobForm.dropoffLongitude);
    if (![pickupLat, pickupLng, dropoffLat, dropoffLng].every(Number.isFinite)) { setJobQuote(null); return; }
    let cancelled = false; setQuoting(true);
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ pickupAddress: jobForm.pickupAddress, pickupLatitude: String(pickupLat), pickupLongitude: String(pickupLng), dropoffAddress: jobForm.dropoffAddress, dropoffLatitude: String(dropoffLat), dropoffLongitude: String(dropoffLng) });
      apiFetch<{ distanceKm: number | null; estimatedFare: number; estimatedDurationMinutes: number | null }>(`/delivery-network/quote?${params}`).then((quote) => !cancelled && setJobQuote(quote)).catch(() => !cancelled && setJobQuote(null)).finally(() => !cancelled && setQuoting(false));
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [jobForm.pickupAddress, jobForm.dropoffAddress, jobForm.pickupLatitude, jobForm.pickupLongitude, jobForm.dropoffLatitude, jobForm.dropoffLongitude]);

  async function reload() { const [nextRiders, nextJobs] = await Promise.all([apiFetch<Rider[]>("/delivery-network/riders"), apiFetch<DeliveryJob[]>("/delivery-network/jobs")]); setRiders(nextRiders); setJobs(nextJobs); }
  function run(action: () => Promise<void>) { setError(null); startTransition(async () => { try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Delivery network action failed"); } }); }
  function createRider(event: FormEvent<HTMLFormElement>) { event.preventDefault(); run(async () => { await apiFetch("/delivery-network/riders", { method: "POST", body: JSON.stringify(emptyToUndefined(riderForm)) }); setRiderForm({ name: "", email: "", password: "", phoneNumber: "", serviceArea: "", vehicleType: "motorcycle", plateNumber: "", vehicleModel: "", vehicleColor: "" }); await reload(); }); }
  function createJob(event: FormEvent<HTMLFormElement>) { event.preventDefault(); run(async () => { await apiFetch("/delivery-network/jobs", { method: "POST", body: JSON.stringify({ ...emptyToUndefined(jobForm), pickupLatitude: jobForm.pickupLatitude ? Number(jobForm.pickupLatitude) : undefined, pickupLongitude: jobForm.pickupLongitude ? Number(jobForm.pickupLongitude) : undefined, dropoffLatitude: jobForm.dropoffLatitude ? Number(jobForm.dropoffLatitude) : undefined, dropoffLongitude: jobForm.dropoffLongitude ? Number(jobForm.dropoffLongitude) : undefined }) }); setJobForm({ pickupAddress: "Empanada Hauz", pickupLatitude: String(DEFAULT_PICKUP_COORDINATES.latitude), pickupLongitude: String(DEFAULT_PICKUP_COORDINATES.longitude), dropoffAddress: "", dropoffLatitude: "", dropoffLongitude: "", notes: "" }); setJobQuote(null); await reload(); }); }
  function updateRiderStatus(riderId: string, status: string) { run(async () => { await apiFetch(`/delivery-network/riders/${riderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await reload(); }); }
  function assignJob(jobId: string, riderId: string) { if (!riderId) return; run(async () => { await apiFetch(`/delivery-network/jobs/${jobId}/assign`, { method: "PATCH", body: JSON.stringify({ riderId }) }); await reload(); }); }
  function updateJobStatus(jobId: string, status: string) { run(async () => { await apiFetch(`/delivery-network/jobs/${jobId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await reload(); }); }

  return <div className="space-y-6">
    {error ? <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card><div className="mb-5 flex items-center justify-between"><div><p className="text-sm text-foreground/55">Create rider accounts for your own fleet.</p><h2 className="text-xl font-semibold">Riders</h2></div><UserPlus size={20} className="text-foreground/45" /></div><form className="grid gap-3 md:grid-cols-2" onSubmit={createRider}>
        <Input placeholder="Rider name" value={riderForm.name} onChange={(e) => setRiderForm({ ...riderForm, name: e.target.value })} required /><Input placeholder="Email" type="email" value={riderForm.email} onChange={(e) => setRiderForm({ ...riderForm, email: e.target.value })} required /><Input placeholder="Temporary password" type="password" value={riderForm.password} onChange={(e) => setRiderForm({ ...riderForm, password: e.target.value })} required /><Input placeholder="Phone number" value={riderForm.phoneNumber} onChange={(e) => setRiderForm({ ...riderForm, phoneNumber: e.target.value })} /><Input placeholder="Service area" value={riderForm.serviceArea} onChange={(e) => setRiderForm({ ...riderForm, serviceArea: e.target.value })} /><Select value={riderForm.vehicleType} onChange={(vehicleType) => setRiderForm({ ...riderForm, vehicleType })} options={[{ label: "Motorcycle", value: "motorcycle" }, { label: "Bicycle", value: "bicycle" }, { label: "Car", value: "car" }]} /><Input placeholder="Plate number" value={riderForm.plateNumber} onChange={(e) => setRiderForm({ ...riderForm, plateNumber: e.target.value })} /><Input placeholder="Vehicle model" value={riderForm.vehicleModel} onChange={(e) => setRiderForm({ ...riderForm, vehicleModel: e.target.value })} /><Input placeholder="Vehicle color" value={riderForm.vehicleColor} onChange={(e) => setRiderForm({ ...riderForm, vehicleColor: e.target.value })} /><Button className="md:col-span-2" disabled={pending}><Plus size={16} />Add Rider</Button>
      </form></Card>
      <Card><div className="mb-5 flex items-center justify-between"><div><p className="text-sm text-foreground/55">Google Maps fills distance, fare, and ETA when configured.</p><h2 className="text-xl font-semibold">New Delivery Job</h2></div><Send size={20} className="text-foreground/45" /></div><form className="grid gap-3 md:grid-cols-2" onSubmit={createJob}>
        <PlacesAddressInput placeholder="Pickup address" value={jobForm.pickupAddress} onChange={(pickupAddress) => setJobForm((current) => ({ ...current, pickupAddress, pickupLatitude: "", pickupLongitude: "" }))} onPlaceSelect={(place) => setJobForm((current) => ({ ...current, pickupAddress: place.address, pickupLatitude: String(place.latitude), pickupLongitude: String(place.longitude) }))} disableAutocomplete required />
        <PlacesAddressInput placeholder="Dropoff address" value={jobForm.dropoffAddress} onChange={(dropoffAddress) => setJobForm((current) => ({ ...current, dropoffAddress, dropoffLatitude: "", dropoffLongitude: "" }))} onPlaceSelect={(place) => setJobForm((current) => ({ ...current, dropoffAddress: place.address, dropoffLatitude: String(place.latitude), dropoffLongitude: String(place.longitude) }))} required />
        <div className="md:col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-line bg-black/10 px-4 py-3"><div><p className="text-xs uppercase tracking-wide text-foreground/45">Distance</p><p className="mt-1 text-lg font-semibold tabular-nums">{quoting ? "Calculating…" : jobQuote?.distanceKm != null ? `${jobQuote.distanceKm.toFixed(2)} km` : "—"}</p></div><div><p className="text-xs uppercase tracking-wide text-foreground/45">Fare</p><p className="mt-1 text-lg font-semibold tabular-nums">{quoting ? "Calculating…" : jobQuote ? `Php ${jobQuote.estimatedFare}` : "—"}</p></div><p className="col-span-2 text-xs text-foreground/40">{jobForm.dropoffAddress.trim() ? "Select an address suggestion to calculate the distance and fare." : "Enter a drop-off address to see suggestions."}</p></div>
        <Input placeholder="Notes" className="md:col-span-2" value={jobForm.notes} onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })} /><Button className="md:col-span-2" disabled={pending || !jobForm.dropoffLatitude}><Plus size={16} />Create Job</Button>
      </form></Card>
    </div>
    <Card><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Rider Fleet</h2><Bike size={20} className="text-foreground/45" /></div><Table className="min-w-[860px]"><thead><tr><Th>Rider</Th><Th>Vehicle</Th><Th>Area</Th><Th>Last Location</Th><Th>Status</Th></tr></thead><tbody>{riders.map((rider) => { const vehicle = rider.vehicles[0], location = rider.locations[0]; return <tr key={rider.id}><Td><div className="font-medium">{rider.user.name}</div><div className="text-xs text-foreground/50">{rider.phoneNumber ?? rider.user.email}</div></Td><Td>{vehicle ? [vehicle.type, vehicle.plateNumber, vehicle.model].filter(Boolean).join(" | ") : "No vehicle"}</Td><Td>{rider.serviceArea ?? "Any area"}</Td><Td>{location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "No GPS yet"}</Td><Td className="min-w-[170px]"><Select value={rider.status} onChange={(value) => updateRiderStatus(rider.id, value)} options={riderStatusOptions} /></Td></tr>; })}</tbody></Table></Card>
    <Card><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Dispatch Jobs</h2><MapPin size={20} className="text-foreground/45" /></div><Table className="min-w-[1240px]"><thead><tr><Th>Job</Th><Th>Pickup</Th><Th>Dropoff</Th><Th>Distance</Th><Th>ETA</Th><Th>Fare</Th><Th>Rider</Th><Th>Status</Th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><Td><div className="font-medium">{job.order?.orderNumber ?? job.id.slice(-8)}</div><div className="text-xs text-foreground/50">{job.order?.customer.name ?? new Date(job.requestedAt).toLocaleString()}</div></Td><Td>{job.pickupAddress}</Td><Td>{job.dropoffAddress}</Td><Td>{formatDistance(job.distanceKm)}</Td><Td>{formatEta(job)}</Td><Td>Php {job.finalFare ?? job.estimatedFare}</Td><Td className="min-w-[210px]">{job.rider ? <div className="flex items-center gap-2 text-sm"><Check size={16} className="text-success" />{job.rider.user.name}</div> : <AssignSelect riders={onlineRiders} onAssign={(riderId) => assignJob(job.id, riderId)} />}</Td><Td className="min-w-[190px]"><Select value={job.status} onChange={(value) => updateJobStatus(job.id, value)} options={jobStatusOptions} /></Td></tr>)}</tbody></Table></Card>
  </div>;
}

function PlacesAddressInput({ placeholder, value, onChange, onPlaceSelect, disableAutocomplete, required }: { placeholder: string; value: string; onChange: (value: string) => void; onPlaceSelect: (place: { address: string; latitude: number; longitude: number }) => void; disableAutocomplete?: boolean; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange), onPlaceSelectRef = useRef(onPlaceSelect);
  const [ready, setReady] = useState(false), [loadError, setLoadError] = useState(false);
  useEffect(() => { onChangeRef.current = onChange; onPlaceSelectRef.current = onPlaceSelect; });
  useEffect(() => {
    if (disableAutocomplete || !inputRef.current) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setLoadError(true); return; }
    let cancelled = false;
    loadGooglePlaces(apiKey).then(() => {
      const Autocomplete = (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
      if (cancelled || !Autocomplete || !inputRef.current) { if (!cancelled) setLoadError(true); return; }
      const autocomplete = new Autocomplete(inputRef.current, { fields: ["formatted_address", "geometry", "name"], types: ["geocode", "establishment"], componentRestrictions: { country: "ph" } });
      autocomplete.addListener("place_changed", () => { const place = autocomplete.getPlace(), location = place.geometry?.location; if (!location) return; onPlaceSelectRef.current({ address: place.formatted_address ?? place.name ?? inputRef.current?.value ?? "", latitude: location.lat(), longitude: location.lng() }); });
      setReady(true);
    }).catch(() => setLoadError(true));
    return () => { cancelled = true; };
  }, [disableAutocomplete]);
  return <div className="relative"><Input ref={inputRef} placeholder={placeholder} value={value} onChange={(e) => onChangeRef.current(e.target.value)} required={required} autoComplete="off" aria-autocomplete={disableAutocomplete ? undefined : "list"} />{!disableAutocomplete && value.length >= 3 && !ready && <p className="absolute left-2 top-full z-20 mt-1 text-xs text-foreground/50">{loadError ? "Address suggestions are unavailable. Check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and Places API access." : "Loading address suggestions…"}</p>}</div>;
}

function loadGooglePlaces(apiKey: string) {
  const mapsWindow = window as GoogleMapsWindow;
  if (mapsWindow.google?.maps?.places?.Autocomplete) return Promise.resolve();
  const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-places]");
  if (existingScript) return new Promise<void>((resolve, reject) => { if ((window as GoogleMapsWindow).google?.maps?.places?.Autocomplete) resolve(); else { existingScript.addEventListener("load", () => resolve(), { once: true }); existingScript.addEventListener("error", () => reject(new Error("Google Places failed to load")), { once: true }); } });
  return new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&region=PH`; script.async = true; script.defer = true; script.dataset.googlePlaces = "true"; script.addEventListener("load", () => resolve(), { once: true }); script.addEventListener("error", () => reject(new Error("Google Places failed to load")), { once: true }); document.head.appendChild(script); });
}
function AssignSelect({ riders, onAssign }: { riders: Rider[]; onAssign: (riderId: string) => void }) { const [value, setValue] = useState(""); return <Select value={value} placeholder="Assign rider" onChange={(next) => { setValue(next); onAssign(next); }} options={riders.map((rider) => ({ label: rider.user.name, value: rider.id }))} />; }
function emptyToUndefined(values: Record<string, string>) { return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() || undefined])); }
function formatDistance(distanceKm?: number | null) { return typeof distanceKm === "number" ? `${distanceKm.toFixed(2)} km` : "Pending"; }
function formatEta(job: DeliveryJob) { if (job.estimatedDurationMinutes && job.estimatedArrivalAt) return `${job.estimatedDurationMinutes} min | ${new Date(job.estimatedArrivalAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`; if (job.estimatedDurationMinutes) return `${job.estimatedDurationMinutes} min`; return "Pending"; }