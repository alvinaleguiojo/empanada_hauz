import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeGateway } from "../../common/realtime.gateway";
import { OrdersService } from "../orders/orders.service";
import { CreateManualDeliveryDto } from "./dto";

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly ordersService: OrdersService
  ) {}

  async listQueue() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ["ready_for_booking", "booked"] },
        deliveryMethod: "maxim"
      },
      include: {
        customer: true,
        delivery: true
      },
      orderBy: [{ preferredSchedule: "asc" }, { createdAt: "asc" }]
    });

    return orders.map((order: (typeof orders)[number]) => ({
      id: order.id,
      customerName: order.customer.name,
      phoneNumber: order.customer.phoneNumber,
      address: order.address,
      quantity: order.quantity,
      totalAmount: order.totalAmount,
      preferredSchedule: order.preferredSchedule,
      deliveryFee: order.deliveryFee,
      areaGroup: order.location,
      copyDetails: [
        order.customer.name,
        order.customer.phoneNumber ?? "No phone",
        order.address ?? order.location ?? "No address",
        `${order.quantity} pcs`,
        `Php ${order.totalAmount}`,
        order.preferredSchedule?.toISOString() ?? "No schedule"
      ].join(" | ")
    }));
  }

  async groupByArea() {
    const queue = await this.listQueue();
    const grouped: Record<string, Array<(typeof queue)[number]>> = queue.reduce(
      (acc: Record<string, Array<(typeof queue)[number]>>, item: (typeof queue)[number]) => {
        const key = item.areaGroup ?? "Unassigned";
        acc[key] ??= [];
        acc[key].push(item);
        return acc;
      },
      {} as Record<string, Array<(typeof queue)[number]>>
    );
    this.realtime.emit("deliveries.updated", grouped);
    return grouped;
  }

  async createManual(dto: CreateManualDeliveryDto) {
    const deliveryFee = dto.deliveryFee ?? 0;
    const itemSubtotal = Math.max(dto.totalAmount - deliveryFee, 0);
    const unitPrice = dto.quantity > 0 ? Number((itemSubtotal / dto.quantity).toFixed(2)) : 0;
    const order = await this.ordersService.createManual({
      customerName: dto.customerName,
      phoneNumber: dto.phoneNumber,
      quantity: dto.quantity,
      unitPrice,
      deliveryFee,
      deliveryMethod: "maxim",
      location: dto.areaGroup,
      address: dto.address,
      preferredSchedule: dto.preferredSchedule,
      status: "ready_for_booking",
      notes: dto.notes
    });

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        totalAmount: dto.totalAmount,
        deliveryFee
      },
      include: {
        customer: true,
        delivery: true
      }
    });

    this.realtime.emit("deliveries.updated", updated);
    return updated;
  }
}
