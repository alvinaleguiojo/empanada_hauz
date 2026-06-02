import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { RealtimeGateway } from "../../common/realtime.gateway";
import { PrismaService } from "../../database/prisma.service";
import {
  AssignDeliveryJobDto,
  CreateDeliveryJobDto,
  CreateDeliveryJobFromOrderDto,
  CreateRiderDto,
  DeliveryJobStatus,
  UpdateDeliveryJobStatusDto,
  UpdateRiderLocationDto,
  UpdateRiderStatusDto
} from "./dto";

@Injectable()
export class DeliveryNetworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway
  ) {}

  async listRiders() {
    return this.prisma.rider.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        vehicles: { where: { isActive: true } },
        locations: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
  }

  async createRider(dto: CreateRiderDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const rider = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          name: dto.name.trim(),
          passwordHash,
          role: "rider"
        }
      });

      return tx.rider.create({
        data: {
          userId: user.id,
          phoneNumber: dto.phoneNumber?.trim() || null,
          serviceArea: dto.serviceArea?.trim() || null,
          vehicles: {
            create: {
              type: dto.vehicleType ?? "motorcycle",
              plateNumber: dto.plateNumber?.trim() || null,
              model: dto.vehicleModel?.trim() || null,
              color: dto.vehicleColor?.trim() || null
            }
          }
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          vehicles: true
        }
      });
    });

    this.realtime.emit("delivery-network.riders.updated", rider);
    return rider;
  }

  async updateRiderStatus(id: string, dto: UpdateRiderStatusDto) {
    await this.ensureRider(id);

    const rider = await this.prisma.rider.update({
      where: { id },
      data: { status: dto.status },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        vehicles: { where: { isActive: true } },
        locations: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    this.realtime.emit("delivery-network.riders.updated", rider);
    return rider;
  }

  async updateRiderLocation(id: string, dto: UpdateRiderLocationDto) {
    await this.ensureRider(id);

    const location = await this.prisma.riderLocation.create({
      data: {
        riderId: id,
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

  async listJobs(status?: DeliveryJobStatus) {
    return this.prisma.deliveryJob.findMany({
      where: status ? { status } : undefined,
      include: this.jobIncludes(),
      orderBy: { requestedAt: "desc" },
      take: 200
    });
  }

  async createJob(dto: CreateDeliveryJobDto) {
    if (dto.orderId) {
      await this.ensureOrder(dto.orderId);
    }

    const job = await this.prisma.deliveryJob.create({
      data: {
        orderId: dto.orderId,
        pickupAddress: dto.pickupAddress,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        dropoffAddress: dto.dropoffAddress,
        dropoffLatitude: dto.dropoffLatitude,
        dropoffLongitude: dto.dropoffLongitude,
        distanceKm: dto.distanceKm,
        estimatedFare: dto.estimatedFare ?? this.estimateFare(dto.distanceKm),
        notes: dto.notes?.trim() || null,
        status: "requested"
      },
      include: this.jobIncludes()
    });

    this.realtime.emit("delivery-network.jobs.updated", job);
    return job;
  }

  async createJobFromOrder(dto: CreateDeliveryJobFromOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { customer: true, deliveryJobs: true }
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (!order.address && !order.location) {
      throw new BadRequestException("Order needs an address or location before creating a delivery job");
    }

    const existingOpenJob = order.deliveryJobs.find((job) => !["delivered", "cancelled"].includes(job.status));
    if (existingOpenJob) {
      throw new BadRequestException("Order already has an open delivery job");
    }

    const job = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryMethod: "own_delivery",
          status: order.status === "ready_for_booking" ? "booked" : order.status
        }
      });

      return tx.deliveryJob.create({
        data: {
          orderId: order.id,
          pickupAddress: dto.pickupAddress,
          pickupLatitude: dto.pickupLatitude,
          pickupLongitude: dto.pickupLongitude,
          dropoffAddress: order.address ?? order.location ?? "No address",
          estimatedFare: dto.estimatedFare ?? Number(order.deliveryFee || 0),
          notes: order.notes,
          status: "requested"
        },
        include: this.jobIncludes()
      });
    });

    this.realtime.emit("orders.updated", job.order);
    this.realtime.emit("delivery-network.jobs.updated", job);
    return job;
  }

  async assignJob(id: string, dto: AssignDeliveryJobDto) {
    const [job, rider] = await Promise.all([this.ensureJob(id), this.ensureRider(dto.riderId)]);

    if (["delivered", "cancelled"].includes(job.status)) {
      throw new BadRequestException("Cannot assign a closed delivery job");
    }

    if (rider.status === "suspended" || rider.status === "offline") {
      throw new BadRequestException("Rider must be online before assignment");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryOffer.upsert({
        where: { jobId_riderId: { jobId: id, riderId: dto.riderId } },
        create: {
          jobId: id,
          riderId: dto.riderId,
          status: "accepted",
          expiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null
        },
        update: {
          status: "accepted",
          expiresAt: dto.offerExpiresAt ? new Date(dto.offerExpiresAt) : null
        }
      });

      await tx.rider.update({
        where: { id: dto.riderId },
        data: { status: "busy" }
      });

      return tx.deliveryJob.update({
        where: { id },
        data: {
          riderId: dto.riderId,
          status: "assigned"
        },
        include: this.jobIncludes()
      });
    });

    this.realtime.emit("delivery-network.jobs.updated", updated);
    this.realtime.emit("delivery-network.riders.updated", { id: dto.riderId, status: "busy" });
    return updated;
  }

  async updateJobStatus(id: string, dto: UpdateDeliveryJobStatusDto) {
    const job = await this.ensureJob(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.deliveryJob.update({
        where: { id },
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

      if (job.riderId && ["delivered", "cancelled"].includes(dto.status)) {
        await tx.rider.update({
          where: { id: job.riderId },
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

  private estimateFare(distanceKm?: number) {
    if (!distanceKm) {
      return 0;
    }
    return Number((50 + distanceKm * 12).toFixed(2));
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
      },
      offers: {
        include: {
          rider: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    } as const;
  }

  private async ensureRider(id: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id } });
    if (!rider) {
      throw new NotFoundException("Rider not found");
    }
    return rider;
  }

  private async ensureOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  private async ensureJob(id: string) {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException("Delivery job not found");
    }
    return job;
  }
}
