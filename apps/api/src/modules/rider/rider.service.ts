import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { RealtimeGateway } from "../../common/realtime.gateway";
import { PrismaService } from "../../database/prisma.service";
import { DeliveryJobStatus } from "../delivery-network/dto";
import { RiderJobStatusDto, RiderLocationDto, RiderRouteQueryDto, RiderStatusDto } from "./dto";

@Injectable()
export class RiderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway
  ) {}

  async getProfile(userId: string) {
    return this.ensureRiderForUser(userId);
  }

  async listJobs(userId: string, status?: DeliveryJobStatus) {
    const rider = await this.ensureRiderForUser(userId);

    // Rider home should only show deliveries for the current local calendar day.
    // Keep the end exclusive so jobs created exactly at midnight tomorrow are not included.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return this.prisma.deliveryJob.findMany({
      where: {
        riderId: rider.id,
        requestedAt: { gte: startOfToday, lt: startOfTomorrow },
        ...(status ? { status } : {})
      },
      include: this.jobIncludes(),
      orderBy: [{ deliveredAt: "desc" }, { requestedAt: "desc" }],
      take: 100
    });
  }

  async route(dto: RiderRouteQueryDto) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException("Google Maps API key is not configured");
    }

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: dto.originLat, longitude: dto.originLng } } },
        destination: { location: { latLng: { latitude: dto.destLat, longitude: dto.destLng } } },
        travelMode: process.env.GOOGLE_MAPS_TRAVEL_MODE ?? "TWO_WHEELER",
        routingPreference: "TRAFFIC_AWARE"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Google Maps route request failed: ${errorText.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }>;
    };

    const route = data.routes?.[0];
    if (!route?.polyline?.encodedPolyline) {
      throw new NotFoundException("No route found between the supplied coordinates");
    }

    return {
      distanceMeters: route.distanceMeters ?? 0,
      duration: route.duration ?? "0s",
      polyline: route.polyline.encodedPolyline
    };
  }

  async updateStatus(userId: string, dto: RiderStatusDto) {
    const rider = await this.ensureRiderForUser(userId);

    if (rider.status === "suspended") {
      throw new ForbiddenException("Suspended riders cannot change availability");
    }

    const updated = await this.prisma.rider.update({
      where: { id: rider.id },
      data: { status: dto.status },
      include: this.riderIncludes()
    });

    this.realtime.emit("delivery-network.riders.updated", updated);
    return updated;
  }

  async updateLocation(userId: string, dto: RiderLocationDto) {
    const rider = await this.ensureRiderForUser(userId);

    const location = await this.prisma.riderLocation.create({
      data: {
        riderId: rider.id,
        latitude: dto.latitude,
        longitude: dto.longitude,
        heading: dto.heading,
        speed: dto.speed
      },
      include: {
        rider: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } }
          }
        }
      }
    });

    this.realtime.emit("delivery-network.rider-location.updated", location);
    return location;
  }

  async updateJobStatus(userId: string, jobId: string, dto: RiderJobStatusDto) {
    const rider = await this.ensureRiderForUser(userId);
    const job = await this.prisma.deliveryJob.findFirst({
      where: { id: jobId, riderId: rider.id }
    });

    if (!job) {
      throw new NotFoundException("Assigned delivery job not found");
    }

    if (["requested", "searching_rider", "assigned"].includes(dto.status)) {
      throw new BadRequestException("Rider cannot move a job back to dispatch status");
    }

    if (["delivered", "cancelled"].includes(job.status)) {
      throw new BadRequestException("Closed delivery jobs cannot be updated");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.deliveryJob.update({
        where: { id: job.id },
        data: {
          status: dto.status,
          finalFare: dto.finalFare,
          acceptedAt: dto.status === "accepted" ? new Date() : job.acceptedAt,
          pickedUpAt: dto.status === "picked_up" ? new Date() : job.pickedUpAt,
          deliveredAt: dto.status === "delivered" ? new Date() : job.deliveredAt,
          cancelledAt: dto.status === "cancelled" ? new Date() : job.cancelledAt
        },
        include: this.jobIncludes()
      });

      if (["accepted", "pickup_started", "picked_up", "delivering"].includes(dto.status)) {
        await tx.rider.update({
          where: { id: rider.id },
          data: { status: "busy" }
        });
      }

      if (["delivered", "cancelled"].includes(dto.status)) {
        await tx.rider.update({
          where: { id: rider.id },
          data: {
            status: "online",
            ...(dto.status === "delivered" ? { completedJobs: { increment: 1 } } : {})
          }
        });
      }

      if (job.orderId && dto.status === "delivered") {
        await tx.order.update({
          where: { id: job.orderId },
          data: { status: "completed" }
        });
      }

      return updatedJob;
    });

    this.realtime.emit("delivery-network.jobs.updated", updated);
    if (updated.orderId && dto.status === "delivered") {
      this.realtime.emit("orders.updated", updated.order);
    }
    return updated;
  }

  private async ensureRiderForUser(userId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { userId },
      include: this.riderIncludes()
    });

    if (!rider) {
      throw new NotFoundException("Rider profile not found");
    }

    return rider;
  }

  private riderIncludes() {
    return {
      user: { select: { id: true, name: true, email: true, role: true } },
      vehicles: { where: { isActive: true } },
      locations: { orderBy: { createdAt: "desc" }, take: 1 }
    } as const;
  }

  private jobIncludes() {
    return {
      order: { include: { customer: true } },
      rider: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          vehicles: { where: { isActive: true } },
          locations: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    } as const;
  }
}
