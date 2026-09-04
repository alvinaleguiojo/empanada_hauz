export type RiderStatus = "offline" | "online" | "busy" | "suspended";
export type JobStatus = "requested" | "searching_rider" | "assigned" | "accepted" | "pickup_started" | "picked_up" | "delivering" | "delivered" | "cancelled";
export type Coordinate = { latitude: number; longitude: number };
export type RiderLocation = Coordinate & { createdAt?: string; accuracy?: number | null };
export type Vehicle = { type: "motorcycle" | "bicycle" | "car"; plateNumber?: string | null; model?: string | null; color?: string | null };
export type RiderProfile = { id: string; status: RiderStatus; rating: number; completedJobs: number; serviceArea?: string | null; phoneNumber?: string | null; user: { id: string; name: string; email: string; role: string }; vehicles: Vehicle[]; locations: RiderLocation[] };
export type DeliveryJob = {
  id: string; status: JobStatus; riderId?: string | null; pickupAddress: string; pickupLatitude?: number | null; pickupLongitude?: number | null; dropoffAddress: string; dropoffLatitude?: number | null; dropoffLongitude?: number | null;
  distanceKm?: number | null; estimatedDurationMinutes?: number | null; estimatedFare: number; finalFare?: number | null; notes?: string | null; requestedAt?: string; deliveredAt?: string | null;
  order?: { orderNumber: string; quantity?: number; totalAmount?: number; deliveryFee?: number; paymentMethod?: "cod" | "gcash"; customer: { name: string; phoneNumber?: string | null } } | null;
};
export const ACTIVE_JOB_STATUSES: JobStatus[] = ["requested", "searching_rider", "assigned", "accepted", "pickup_started", "picked_up", "delivering"];
export const JOB_NEXT_STATUS: Partial<Record<JobStatus, JobStatus>> = { assigned: "accepted", accepted: "pickup_started", pickup_started: "picked_up", picked_up: "delivering", delivering: "delivered" };
export function jobActionLabel(status: JobStatus): string { switch (status) { case "assigned": return "Go to Pickup"; case "accepted": return "Confirm Pickup"; case "pickup_started": return "Confirm Pickup"; case "picked_up": return "Start Delivery"; case "delivering": return "Complete Delivery"; default: return "Open Order"; } }
export function shortJobCode(id: string): string { return `EH-${id.slice(-4).toUpperCase()}`; }
