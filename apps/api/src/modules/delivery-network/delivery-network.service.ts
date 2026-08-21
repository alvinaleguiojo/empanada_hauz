import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { RealtimeGateway } from "../../common/realtime.gateway";
import { PrismaService } from "../../database/prisma.service";
import { MapsService, RouteEstimate } from "./maps.service";
import {
  AssignDeliveryJobDto,
  CreateDeliveryJobDto,
  CreateDeliveryJobFromOrderDto,
  CreateRiderDto,
  DeliveryJobStatus,
  QuoteDeliveryJobDto,
  UpdateDeliveryJobStatusDto,
  UpdateRiderLocationDto,
  UpdateRiderStatusDto
} from "./dto";

const MAX_GPS_ACCURACY_METERS = 100;
const MAX_DEVICE_LOCATION_AGE_MS = 60_000;

@Injectable()
export class DeliveryNetworkService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway, private readonly maps: MapsService) {}

  async listRiders() { return this.prisma.rider.findMany({ include: { user: { select: { id: true, name: true, email: true, role: true } }, vehicles: { where: { isActive: true } }, locations: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] }); }

  async createRider(dto: CreateRiderDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const rider = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: dto.email.toLowerCase().trim(), name: dto.name.trim(), passwordHash, role: "rider" } });
      return tx.rider.create({ data: { userId: user.id, phoneNumber: dto.phoneNumber?.trim() || null, serviceArea: dto.serviceArea?.trim() || null, vehicles: { create: { type: dto.vehicleType ?? "motorcycle", plateNumber: dto.plateNumber?.trim() || null, model: dto.vehicleModel?.trim() || null, color: dto.vehicleColor?.trim() || null } } }, include: { user: { select: { id: true, name: true, email: true, role: true } }, vehicles: true } });
    }, { timeout: 15000 });
    this.realtime.emit("delivery-network.riders.updated", rider); return rider;
  }

  async updateRiderStatus(id: string, dto: UpdateRiderStatusDto) {
    await this.ensureRider(id);
    const rider = await this.prisma.rider.update({ where: { id }, data: { status: dto.status }, include: { user: { select: { id: true, name: true, email: true, role: true } }, vehicles: { where: { isActive: true } }, locations: { orderBy: { createdAt: "desc" }, take: 1 } } });
    this.realtime.emit("delivery-network.riders.updated", rider); this.realtime.emitToRider(id, "rider.status.updated", rider); return rider;
  }

  async updateRiderLocation(id: string, dto: UpdateRiderLocationDto) {
    await this.ensureRider(id);
    if (dto.accuracy == null) throw new BadRequestException("GPS accuracy is required. Please update the rider app.");
    if (dto.accuracy > MAX_GPS_ACCURACY_METERS) throw new BadRequestException(`GPS accuracy is too low (${Math.round(dto.accuracy)}m). Waiting for a better GPS fix.`);
    if (dto.timestamp != null) {
      const age = Date.now() - dto.timestamp;
      if (age < -30_000 || age > MAX_DEVICE_LOCATION_AGE_MS) throw new BadRequestException("GPS fix is stale. Please send the current device location.");
    }
    const location = await this.prisma.riderLocation.create({ data: { riderId: id, latitude: dto.latitude, longitude: dto.longitude, heading: dto.heading, speed: dto.speed }, include: { rider: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } } });
    const realtimeLocation = { ...location, accuracy: dto.accuracy, altitude: dto.altitude ?? null, deviceTimestamp: dto.timestamp ? new Date(dto.timestamp).toISOString() : null };
    this.realtime.emit("delivery-network.rider-location.updated", realtimeLocation);
    this.realtime.emitToRider(id, "rider.location.updated", realtimeLocation);
    return realtimeLocation;
  }

  async listJobs(status?: DeliveryJobStatus) { return this.prisma.deliveryJob.findMany({ where: status ? { status } : undefined, include: this.jobIncludes(), orderBy: { requestedAt: "desc" }, take: 200 }); }
  async quoteJob(dto: QuoteDeliveryJobDto) { const routeEstimate = await this.maps.estimateRoute({ address: dto.pickupAddress, latitude: dto.pickupLatitude, longitude: dto.pickupLongitude }, { address: dto.dropoffAddress, latitude: dto.dropoffLatitude, longitude: dto.dropoffLongitude }); const distanceKm = routeEstimate?.distanceKm; return { distanceKm: distanceKm ?? null, estimatedDurationMinutes: routeEstimate?.durationMinutes ?? null, estimatedArrivalAt: routeEstimate?.estimatedArrivalAt ?? null, estimatedFare: this.estimateFare(distanceKm) }; }
  async createJob(dto: CreateDeliveryJobDto) { if (dto.orderId) await this.ensureOrder(dto.orderId); const routeEstimate = await this.maps.estimateRoute({ address: dto.pickupAddress, latitude: dto.pickupLatitude, longitude: dto.pickupLongitude }, { address: dto.dropoffAddress, latitude: dto.dropoffLatitude, longitude: dto.dropoffLongitude }); const distanceKm = routeEstimate?.distanceKm ?? dto.distanceKm; const job = await this.prisma.deliveryJob.create({ data: { orderId: dto.orderId, pickupAddress: dto.pickupAddress, pickupLatitude: routeEstimate?.origin.latitude ?? dto.pickupLatitude, pickupLongitude: routeEstimate?.origin.longitude ?? dto.pickupLongitude, dropoffAddress: dto.dropoffAddress, dropoffLatitude: routeEstimate?.destination.latitude ?? dto.dropoffLatitude, dropoffLongitude: routeEstimate?.destination.longitude ?? dto.dropoffLongitude, distanceKm, estimatedDurationMinutes: routeEstimate?.durationMinutes, estimatedArrivalAt: routeEstimate?.estimatedArrivalAt, estimatedFare: dto.estimatedFare ?? this.estimateFare(distanceKm), notes: dto.notes?.trim() || null, status: "requested" }, include: this.jobIncludes() }); this.realtime.emit("delivery-network.jobs.updated", job); return job; }
  async createJobFromOrder(dto: CreateDeliveryJobFromOrderDto) { const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { customer: true, deliveryJobs: true } }); if (!order) throw new NotFoundException("Order not found"); if (!order.address && !order.location) throw new BadRequestException("Order needs an address or location before creating a delivery job"); const existingOpenJob = order.deliveryJobs.find((job) => !["delivered", "cancelled"].includes(job.status)); if (existingOpenJob) throw new BadRequestException("Order already has an open delivery job"); const routeEstimate = await this.maps.estimateRoute({ address: dto.pickupAddress, latitude: dto.pickupLatitude, longitude: dto.pickupLongitude }, { address: order.address ?? order.location ?? "No address" }); const estimatedFare = dto.estimatedFare ?? this.resolveEstimatedFare(routeEstimate, Number(order.deliveryFee || 0)); const result = await this.prisma.$transaction(async (tx) => { const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { deliveryMethod: "own_delivery", status: order.status === "ready_for_booking" ? "booked" : order.status }, include: { customer: true, delivery: true, batch: true, orderNotes: true } }); const job = await tx.deliveryJob.create({ data: { orderId: order.id, pickupAddress: dto.pickupAddress, pickupLatitude: routeEstimate?.origin.latitude ?? dto.pickupLatitude, pickupLongitude: routeEstimate?.origin.longitude ?? dto.pickupLongitude, dropoffAddress: order.address ?? order.location ?? "No address", dropoffLatitude: routeEstimate?.destination.latitude, dropoffLongitude: routeEstimate?.destination.longitude, distanceKm: routeEstimate?.distanceKm, estimatedDurationMinutes: routeEstimate?.durationMinutes, estimatedArrivalAt: routeEstimate?.estimatedArrivalAt, estimatedFare, notes: order.notes, status: "requested" }, include: this.jobIncludes() }); return { job, updatedOrder }; }); this.realtime.emit("orders.updated", result.updatedOrder); this.realtime.emit("delivery-network.jobs.updated", result.job); return result.job; }
  async assignJob(id: string, dto: AssignDeliveryJobDto) { const [job, rider] = await Promise.all([this.ensureJob(id), this.ensureRider(dto.riderId)]); if (["delivered", "cancelled"].includes(job.status)) throw new BadRequestException("Cannot assign a closed delivery job"); if (rider.status === "suspended" || rider.status === "offline") throw new BadRequestException("Rider must be online before assignment"); const updated = await this.prisma.$transaction(async (tx) => { await tx.deliveryOffer.upsert({ where: { jobId_riderId: { jobId: id, riderId: dto.riderId } }, create: { jobId: id, riderId: dto.riderId, status: "accepted", expiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null }, update: { status: "accepted", expiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null } }); await tx.rider.update({ where: { id: dto.riderId }, data: { status: "busy" } }); return tx.deliveryJob.update({ where: { id }, data: { riderId: dto.riderId, status: "assigned" }, include: this.jobIncludes() }); }); this.realtime.emit("delivery-network.jobs.updated", updated); this.realtime.emitToRider(dto.riderId, "rider.delivery.assigned", updated); this.realtime.emit("delivery-network.riders.updated", { id: dto.riderId, status: "busy" }); this.realtime.emitToRider(dto.riderId, "rider.status.updated", { id: dto.riderId, status: "busy" }); return updated; }
  async updateJobStatus(id: string, dto: UpdateDeliveryJobStatusDto) { const job = await this.ensureJob(id); const updated = await this.prisma.$transaction(async (tx) => { const updatedJob = await tx.deliveryJob.update({ where: { id }, data: { status: dto.status, finalFare: dto.finalFare, acceptedAt: dto.status === "accepted" ? new Date() : job.acceptedAt, pickedUpAt: dto.status === "picked_up" ? new Date() : job.pickedUpAt, deliveredAt: dto.status === "delivered" ? new Date() : job.deliveredAt, cancelledAt: dto.status === "cancelled" ? new Date() : job.cancelledAt }, include: this.jobIncludes() }); if (job.riderId && ["delivered", "cancelled"].includes(dto.status)) await tx.rider.update({ where: { id: job.riderId }, data: { status: "online", ...(dto.status === "delivered" ? { completedJobs: { increment: 1 } } : {}) } }); if (job.orderId && dto.status === "delivered") await tx.order.update({ where: { id: job.orderId }, data: { status: "completed" } }); return updatedJob; }); this.realtime.emit("delivery-network.jobs.updated", updated); if (updated.riderId) this.realtime.emitToRider(updated.riderId, "rider.delivery.updated", updated); if (updated.orderId && dto.status === "delivered") this.realtime.emit("orders.updated", updated.order); return updated; }
  private resolveEstimatedFare(routeEstimate: RouteEstimate | null, fallbackFare: number) { return routeEstimate ? this.estimateFare(routeEstimate.distanceKm) : fallbackFare; }
  private estimateFare(distanceKm?: number) { if (!distanceKm) return 0; const baseFare = Number(process.env.DELIVERY_BASE_FARE ?? 50); const perKmRate = Number(process.env.DELIVERY_PER_KM_RATE ?? 12); const serviceFee = Number(process.env.DELIVERY_SERVICE_FEE ?? 0); return Math.ceil(baseFare + distanceKm * perKmRate + serviceFee); }
  private jobIncludes() { return { order: { include: { customer: true } }, rider: { include: { user: { select: { id: true, name: true, email: true, role: true } }, vehicles: { where: { isActive: true } }, locations: { orderBy: { createdAt: "desc" }, take: 1 } } }, offers: { include: { rider: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } }, orderBy: { createdAt: "desc" } } } as const; }
  private async ensureRider(id: string) { const rider = await this.prisma.rider.findUnique({ where: { id } }); if (!rider) throw new NotFoundException("Rider not found"); return rider; }
  private async ensureOrder(id: string) { const order = await this.prisma.order.findUnique({ where: { id } }); if (!order) throw new NotFoundException("Order not found"); return order; }
  private async ensureJob(id: string) { const job = await this.prisma.deliveryJob.findUnique({ where: { id } }); if (!job) throw new NotFoundException("Delivery job not found"); return job; }
}
