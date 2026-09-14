import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
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
  UpdateDeliveryPricingDto,
  UpdateRiderLocationDto,
  UpdateRiderStatusDto
} from "./dto";

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };
type DeliveryPricingRecord = {
  _id: string;
  baseFare: number;
  perKmRate: number;
  updatedAt?: Date | string;
};

const DEFAULT_DELIVERY_BASE_FARE = 30;
const DEFAULT_DELIVERY_PER_KM_RATE = 10;
const DELIVERY_PRICING_ID = "default";
const DELIVERY_PRICING_COLLECTION = "delivery_network_settings";
const DELIVERY_PRICING_CACHE_MS = 5000;
const MAX_GPS_ACCURACY_METERS = 100;
const MAX_DEVICE_LOCATION_AGE_MS = 60_000;
const RIDER_PRESENCE_TIMEOUT_MS = 90_000;
const RIDER_PRESENCE_CHECK_MS = 30_000;
const DELIVERY_TIME_ZONE = "Asia/Manila";

@Injectable()
export class DeliveryNetworkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryNetworkService.name);
  private presenceTimer?: NodeJS.Timeout;
  private pricingCache: { expiresAt: number; value: { baseFare: number; perKmRate: number } } | null = null;

  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway, private readonly maps: MapsService) {}

  async onModuleInit() {
    try {
      await this.getDeliveryPricing();
    } catch (error) {
      this.logger.warn(`Delivery pricing startup sync skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.presenceTimer = setInterval(() => {
      void this.expireStaleRiderPresence().catch((error) => {
        this.logger.warn(`Stale rider presence cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, RIDER_PRESENCE_CHECK_MS);
  }

  onModuleDestroy() {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
  }

  async getDeliveryPricing() {
    if (this.pricingCache && this.pricingCache.expiresAt > Date.now()) return this.pricingCache.value;

    const result = (await this.prisma.$runCommandRaw({
      find: DELIVERY_PRICING_COLLECTION,
      filter: { _id: DELIVERY_PRICING_ID },
      limit: 1
    })) as unknown as MongoFindResult<DeliveryPricingRecord>;

    const existing = result.cursor?.firstBatch?.[0];
    if (existing) {
      const value = {
        baseFare: Number(existing.baseFare),
        perKmRate: Number(existing.perKmRate)
      };
      this.pricingCache = { expiresAt: Date.now() + DELIVERY_PRICING_CACHE_MS, value };
      return value;
    }

    const now = new Date();
    const value = { baseFare: DEFAULT_DELIVERY_BASE_FARE, perKmRate: DEFAULT_DELIVERY_PER_KM_RATE };
    await this.prisma.$runCommandRaw({
      insert: DELIVERY_PRICING_COLLECTION,
      documents: [{ _id: DELIVERY_PRICING_ID, ...value, createdAt: now, updatedAt: now }]
    });
    this.pricingCache = { expiresAt: Date.now() + DELIVERY_PRICING_CACHE_MS, value };
    return value;
  }

  async updateDeliveryPricing(dto: UpdateDeliveryPricingDto) {
    const baseFare = Number(dto.baseFare);
    const perKmRate = Number(dto.perKmRate);
    if (!Number.isFinite(baseFare) || baseFare < 0) throw new BadRequestException("Base fare must be a non-negative number.");
    if (!Number.isFinite(perKmRate) || perKmRate < 0) throw new BadRequestException("Per-kilometer rate must be a non-negative number.");

    const now = new Date();
    const result = await this.prisma.$runCommandRaw({
      update: DELIVERY_PRICING_COLLECTION,
      updates: [{
        q: { _id: DELIVERY_PRICING_ID },
        u: {
          $set: { baseFare, perKmRate, updatedAt: now },
          $setOnInsert: { createdAt: now }
        },
        upsert: true
      }]
    });
    void result;

    const value = { baseFare, perKmRate };
    this.pricingCache = { expiresAt: Date.now() + DELIVERY_PRICING_CACHE_MS, value };
    this.realtime.emit("delivery-network.pricing.updated", value);
    return value;
  }

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
    const rider = await this.ensureRider(id);
    if (dto.accuracy == null) throw new BadRequestException("GPS accuracy is required. Please update the rider app.");
    if (dto.accuracy > MAX_GPS_ACCURACY_METERS) throw new BadRequestException(`GPS accuracy is too low (${Math.round(dto.accuracy)}m). Waiting for a better GPS fix.`);
    if (dto.timestamp != null) {
      const age = Date.now() - dto.timestamp;
      if (age < -30_000 || age > MAX_DEVICE_LOCATION_AGE_MS) throw new BadRequestException("GPS fix is stale. Please send the current device location.");
    }

    const location = await this.prisma.riderLocation.create({ data: { riderId: id, latitude: dto.latitude, longitude: dto.longitude, heading: dto.heading, speed: dto.speed }, include: { rider: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } } });
    const status = rider.status === "offline" ? "online" : rider.status;
    const refreshedRider = await this.prisma.rider.update({ where: { id }, data: { status, updatedAt: new Date() }, include: { user: { select: { id: true, name: true, email: true, role: true } }, vehicles: { where: { isActive: true } } } });
    const realtimeLocation = { ...location, accuracy: dto.accuracy, altitude: dto.altitude ?? null, deviceTimestamp: dto.timestamp ? new Date(dto.timestamp).toISOString() : null };
    this.realtime.emit("delivery-network.rider-location.updated", realtimeLocation);
    this.realtime.emitToRider(id, "rider.location.updated", realtimeLocation);
    if (rider.status !== status) { this.realtime.emit("delivery-network.riders.updated", refreshedRider); this.realtime.emitToRider(id, "rider.status.updated", refreshedRider); }
    return realtimeLocation;
  }

  private async expireStaleRiderPresence() {
    const cutoff = new Date(Date.now() - RIDER_PRESENCE_TIMEOUT_MS);
    const staleRiders = await this.prisma.rider.findMany({ where: { status: "online", updatedAt: { lt: cutoff } }, select: { id: true } });
    if (!staleRiders.length) return;
    await this.prisma.rider.updateMany({ where: { id: { in: staleRiders.map((rider) => rider.id) }, status: "online" }, data: { status: "offline" } });
    for (const rider of staleRiders) {
      this.realtime.emit("delivery-network.riders.updated", { id: rider.id, status: "offline" });
      this.realtime.emitToRider(rider.id, "rider.status.updated", { id: rider.id, status: "offline" });
    }
  }

  async listJobs(status?: DeliveryJobStatus) { const { start, end } = this.getCurrentDeliveryDayRange(); return this.prisma.deliveryJob.findMany({ where: { requestedAt: { gte: start, lt: end }, ...(status ? { status } : {}) }, include: this.jobIncludes(), orderBy: { requestedAt: "desc" }, take: 200 }); }
  async quoteJob(dto: QuoteDeliveryJobDto) {
    const routeEstimate = await this.maps.estimateRoute({ address: dto.pickupAddress, latitude: dto.pickupLatitude, longitude: dto.pickupLongitude }, { address: dto.dropoffAddress, latitude: dto.dropoffLatitude, longitude: dto.dropoffLongitude });
    const distanceKm = routeEstimate?.distanceKm;
    return { distanceKm: distanceKm ?? null, estimatedDurationMinutes: routeEstimate?.durationMinutes ?? null, estimatedArrivalAt: routeEstimate?.estimatedArrivalAt ?? null, estimatedFare: await this.estimateFare(distanceKm) };
  }
  async createJob(dto: CreateDeliveryJobDto) { if (dto.orderId) await this.ensureOrder(dto.orderId); const routeEstimate = await this.maps.estimateRoute({ address: dto.pickupAddress, latitude: dto.pickupLatitude, longitude: dto.pickupLongitude }, { address: dto.dropoffAddress, latitude: dto.dropoffLatitude, longitude: dto.dropoffLongitude }); const distanceKm = routeEstimate?.distanceKm ?? dto.distanceKm; const job = await this.prisma.deliveryJob.create({ data: { orderId: dto.orderId, pickupAddress: dto.pickupAddress, pickupLatitude: routeEstimate?.origin.latitude ?? dto.pickupLatitude, pickupLongitude: routeEstimate?.origin.longitude ?? dto.pickupLongitude, dropoffAddress: dto.dropoffAddress, dropoffLatitude: routeEstimate?.destination.latitude ?? dto.dropoffLatitude, dropoffLongitude: routeEstimate?.destination.longitude ?? dto.dropoffLongitude, distanceKm, estimatedDurationMinutes: routeEstimate?.durationMinutes, estimatedArrivalAt: routeEstimate?.estimatedArrivalAt, estimatedFare: dto.estimatedFare ?? await this.estimateFare(distanceKm), notes: dto.notes?.trim() || null, status: "requested" }, include: this.jobIncludes() }); this.realtime.emit("delivery-network.jobs.updated", job); return job; }
  async createJobFromOrder(dto: CreateDeliveryJobFromOrderDto) { const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { customer: true, deliveryJobs: true } }); if (!order) throw new NotFoundException("Order not found"); if (!order.address && !order.location) throw new BadRequestException("Order needs an address or location before creating a delivery job"); const existingOpenJob = order.deliveryJobs.find((job) => !["delivered", "cancelled"].includes(job.status)); if (existingOpenJob) throw new BadRequestException("Order already has an open delivery job"); const routeEstimate = await this.maps.estimateRoute({ address: dto.pickupAddress, latitude: dto.pickupLatitude, longitude: dto.pickupLongitude }, { address: order.address ?? order.location ?? "No address" }); const estimatedFare = dto.estimatedFare ?? await this.resolveEstimatedFare(routeEstimate, Number(order.deliveryFee || 0)); const result = await this.prisma.$transaction(async (tx) => { const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { deliveryMethod: "own_delivery", status: order.status === "ready_for_booking" ? "booked" : order.status }, include: { customer: true, delivery: true, batch: true, orderNotes: true } }); const job = await tx.deliveryJob.create({ data: { orderId: order.id, pickupAddress: dto.pickupAddress, pickupLatitude: routeEstimate?.origin.latitude ?? dto.pickupLatitude, pickupLongitude: routeEstimate?.origin.longitude ?? dto.pickupLongitude, dropoffAddress: order.address ?? order.location ?? "No address", dropoffLatitude: routeEstimate?.destination.latitude, dropoffLongitude: routeEstimate?.destination.longitude, distanceKm: routeEstimate?.distanceKm, estimatedDurationMinutes: routeEstimate?.durationMinutes, estimatedArrivalAt: routeEstimate?.estimatedArrivalAt, estimatedFare, notes: order.notes, status: "requested" }, include: this.jobIncludes() }); return { job, updatedOrder }; }); this.realtime.emit("orders.updated", result.updatedOrder); this.realtime.emit("delivery-network.jobs.updated", result.job); return result.job; }
  async assignJob(id: string, dto: AssignDeliveryJobDto) { const [job, rider] = await Promise.all([this.ensureJob(id), this.ensureRider(dto.riderId)]); if (["delivered", "cancelled"].includes(job.status)) throw new BadRequestException("Cannot assign a closed delivery job"); if (rider.status === "suspended" || rider.status === "offline") throw new BadRequestException("Rider must be online before assignment"); const updated = await this.prisma.$transaction(async (tx) => { await tx.deliveryOffer.upsert({ where: { jobId_riderId: { jobId: id, riderId: dto.riderId } }, create: { jobId: id, riderId: dto.riderId, status: "accepted", expiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null }, update: { status: "accepted", expiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null } }); await tx.rider.update({ where: { id: dto.riderId }, data: { status: "busy" } }); return tx.deliveryJob.update({ where: { id }, data: { riderId: dto.riderId, status: "assigned" }, include: this.jobIncludes() }); }); this.realtime.emit("delivery-network.jobs.updated", updated); this.realtime.emitToRider(dto.riderId, "rider.delivery.assigned", updated); this.realtime.emit("delivery-network.riders.updated", { id: dto.riderId, status: "busy" }); this.realtime.emitToRider(dto.riderId, "rider.status.updated", { id: dto.riderId, status: "busy" }); return updated; }
  async updateJobStatus(id: string, dto: UpdateDeliveryJobStatusDto) { const job = await this.ensureJob(id); const updated = await this.prisma.$transaction(async (tx) => { const updatedJob = await tx.deliveryJob.update({ where: { id }, data: { status: dto.status, finalFare: dto.finalFare, acceptedAt: dto.status === "accepted" ? new Date() : job.acceptedAt, pickedUpAt: dto.status === "picked_up" ? new Date() : job.pickedUpAt, deliveredAt: dto.status === "delivered" ? new Date() : job.deliveredAt, cancelledAt: dto.status === "cancelled" ? new Date() : job.cancelledAt }, include: this.jobIncludes() }); if (job.riderId && ["delivered", "cancelled"].includes(dto.status)) await tx.rider.update({ where: { id: job.riderId }, data: { status: "online", ...(dto.status === "delivered" ? { completedJobs: { increment: 1 } } : {}) } }); if (job.orderId && dto.status === "delivered") await tx.order.update({ where: { id: job.orderId }, data: { status: "completed" } }); return updatedJob; }); this.realtime.emit("delivery-network.jobs.updated", updated); if (updated.riderId) this.realtime.emitToRider(updated.riderId, "rider.delivery.updated", updated); if (updated.orderId && dto.status === "delivered") this.realtime.emit("orders.updated", updated.order); return updated; }
  private getCurrentDeliveryDayRange() { const date = new Intl.DateTimeFormat("en-CA", { timeZone: DELIVERY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); const start = new Date(`${date}T00:00:00+08:00`); const end = new Date(`${date}T00:00:00+08:00`); end.setUTCDate(end.getUTCDate() + 1); return { start, end }; }
  private async resolveEstimatedFare(routeEstimate: RouteEstimate | null, fallbackFare: number) { return routeEstimate ? await this.estimateFare(routeEstimate.distanceKm) : fallbackFare; }
  private async estimateFare(distanceKm?: number) { if (distanceKm == null || !Number.isFinite(Number(distanceKm)) || Number(distanceKm) < 0) return 0; const { baseFare, perKmRate } = await this.getDeliveryPricing(); return Math.ceil(baseFare + Number(distanceKm) * perKmRate); }
  private jobIncludes() { return { order: { include: { customer: true } }, rider: { include: { user: { select: { id: true, name: true, email: true, role: true } }, vehicles: { where: { isActive: true } }, locations: { orderBy: { createdAt: "desc" }, take: 1 } } }, offers: { include: { rider: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } }, orderBy: { createdAt: "desc" } } } as const; }
  private async ensureRider(id: string) { const rider = await this.prisma.rider.findUnique({ where: { id } }); if (!rider) throw new NotFoundException("Rider not found"); return rider; }
  private async ensureOrder(id: string) { const order = await this.prisma.order.findUnique({ where: { id } }); if (!order) throw new NotFoundException("Order not found"); return order; }
  private async ensureJob(id: string) { const job = await this.prisma.deliveryJob.findUnique({ where: { id } }); if (!job) throw new NotFoundException("Delivery job not found"); return job; }
}
