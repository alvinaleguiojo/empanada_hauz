"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
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
  vehicles: Array<{ type: string; plateNumber?: string | null; model?: string | null; color?: string | null }>;
  locations: Array<{ latitude: number; longitude: number; createdAt: string }>;
};

type DeliveryJob = {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFare: number;
  finalFare?: number | null;
  requestedAt: string;
  order?: { orderNumber: string; customer: { name: string; phoneNumber?: string | null } } | null;
  rider?: { id: string; user: { name: string }; vehicles: Array<{ plateNumber?: string | null }> } | null;
};

const riderStatusOptions = [
  { label: "Online", value: "online" },
  { label: "Offline", value: "offline" },
  { label: "Busy", value: "busy" },
  { label: "Suspended", value: "suspended" }
];

const jobStatusOptions = [
  { label: "Accepted", value: "accepted" },
  { label: "Pickup Started", value: "pickup_started" },
  { label: "Picked Up", value: "picked_up" },
  { label: "Delivering", value: "delivering" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" }
];

export function DispatcherBoard({ initialRiders, initialJobs }: { initialRiders: Rider[]; initialJobs: DeliveryJob[] }) {
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
  const [jobForm, setJobForm] = useState({
    pickupAddress: "Empanada Hauz",
    dropoffAddress: "",
    distanceKm: "",
    estimatedFare: "",
    notes: ""
  });
  const onlineRiders = useMemo(() => riders.filter((rider) => rider.status === "online" || rider.status === "busy"), [riders]);

  async function reload() {
    const [nextRiders, nextJobs] = await Promise.all([
      apiFetch<Rider[]>("/delivery-network/riders"),
      apiFetch<DeliveryJob[]>("/delivery-network/jobs")
    ]);
    setRiders(nextRiders);
    setJobs(nextJobs);
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

  function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      await apiFetch("/delivery-network/jobs", {
        method: "POST",
        body: JSON.stringify({
          ...emptyToUndefined(jobForm),
          distanceKm: jobForm.distanceKm ? Number(jobForm.distanceKm) : undefined,
          estimatedFare: jobForm.estimatedFare ? Number(jobForm.estimatedFare) : undefined
        })
      });
      setJobForm({ pickupAddress: "Empanada Hauz", dropoffAddress: "", distanceKm: "", estimatedFare: "", notes: "" });
      await reload();
    });
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
    if (!riderId) {
      return;
    }
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

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

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
              onChange={(value) => setRiderForm({ ...riderForm, vehicleType: value })}
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
              <p className="text-sm text-foreground/55">Manual dispatch job for the first MVP.</p>
              <h2 className="text-xl font-semibold">New Delivery Job</h2>
            </div>
            <Send size={20} className="text-foreground/45" />
          </div>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createJob}>
            <Input placeholder="Pickup address" value={jobForm.pickupAddress} onChange={(e) => setJobForm({ ...jobForm, pickupAddress: e.target.value })} required />
            <Input placeholder="Dropoff address" value={jobForm.dropoffAddress} onChange={(e) => setJobForm({ ...jobForm, dropoffAddress: e.target.value })} required />
            <Input placeholder="Distance km" type="number" min="0" step="0.01" value={jobForm.distanceKm} onChange={(e) => setJobForm({ ...jobForm, distanceKm: e.target.value })} />
            <Input placeholder="Estimated fare" type="number" min="0" step="0.01" value={jobForm.estimatedFare} onChange={(e) => setJobForm({ ...jobForm, estimatedFare: e.target.value })} />
            <Input placeholder="Notes" className="md:col-span-2" value={jobForm.notes} onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })} />
            <Button className="md:col-span-2" disabled={pending}>
              <Plus size={16} />
              Create Job
            </Button>
          </form>
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
        <Table className="min-w-[1120px]">
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>Pickup</Th>
              <Th>Dropoff</Th>
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
                  <div className="text-xs text-foreground/50">{job.order?.customer.name ?? new Date(job.requestedAt).toLocaleString()}</div>
                </Td>
                <Td>{job.pickupAddress}</Td>
                <Td>{job.dropoffAddress}</Td>
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

function AssignSelect({ riders, onAssign }: { riders: Rider[]; onAssign: (riderId: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <Select
      value={value}
      placeholder="Assign rider"
      onChange={(next) => {
        setValue(next);
        onAssign(next);
      }}
      options={riders.map((rider) => ({ label: rider.user.name, value: rider.id }))}
    />
  );
}

function emptyToUndefined(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() || undefined]));
}
