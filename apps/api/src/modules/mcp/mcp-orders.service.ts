import { Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { DeliveryMethod, ManualOrderEntryDto, PaymentMethod } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

@Injectable()
export class McpOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService
  ) {}

  async listOrders(params: {
    cursor?: string;
    limit?: number;
    status?: string;
    customerName?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const where = this.buildWhere(params);

    const orders = await this.prisma.order.findMany({
      where,
      include: this.orderInclude(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {})
    });

    const page = orders.slice(0, limit);
    const nextOrder = orders[limit];

    return {
      orders: page.map((order) => this.serializeOrder(order)),
      count: page.length,
      hasMore: Boolean(nextOrder),
      nextCursor: nextOrder?.id ?? null
    };
  }

  async getOrder(params: { id?: string; orderNumber?: string }) {
    const order = await this.prisma.order.findFirst({
      where: params.id ? { id: params.id } : { orderNumber: params.orderNumber },
      include: this.orderInclude()
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return this.serializeOrder(order);
  }

  async createOrder(params: {
    customerName: string;
    phoneNumber?: string;
    quantity: number;
    unitPrice?: number;
    deliveryFee?: number;
    deliveryMethod?: DeliveryMethod;
    paymentMethod?: PaymentMethod;
    location?: string;
    address?: string;
    preferredSchedule?: string;
    status?: OrderStatus;
    items?: ManualOrderEntryDto["items"];
    notes?: string;
  }) {
    const order = await this.ordersService.createManual({
      customerName: params.customerName,
      phoneNumber: params.phoneNumber,
      quantity: params.quantity,
      unitPrice: params.unitPrice ?? 18,
      deliveryFee: params.deliveryFee ?? 0,
      deliveryMethod: params.deliveryMethod ?? "pickup",
      paymentMethod: params.paymentMethod ?? "cod",
      location: params.location,
      address: params.address,
      preferredSchedule: params.preferredSchedule,
      status: params.status,
      items: params.items,
      notes: params.notes
    });

    return this.serializeOrder(order);
  }

  async summarizeOrders(params: { fromDate?: string; toDate?: string }) {
    const where = this.buildWhere(params);
    const [totalOrders, totals, byStatus, byDeliveryMethod, byPaymentMethod] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where,
        _sum: { quantity: true, totalAmount: true, deliveryFee: true },
        _avg: { quantity: true, totalAmount: true }
      }),
      this.prisma.order.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
        _sum: { quantity: true, totalAmount: true }
      }),
      this.prisma.order.groupBy({
        by: ["deliveryMethod"],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true }
      }),
      this.prisma.order.groupBy({
        by: ["paymentMethod"],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true }
      })
    ]);

    return {
      totalOrders,
      totalQuantity: totals._sum.quantity ?? 0,
      totalRevenue: totals._sum.totalAmount ?? 0,
      totalDeliveryFees: totals._sum.deliveryFee ?? 0,
      averageQuantity: totals._avg.quantity ?? 0,
      averageOrderAmount: totals._avg.totalAmount ?? 0,
      byStatus: byStatus.map((row) => ({
        status: row.status,
        orders: row._count._all,
        quantity: row._sum.quantity ?? 0,
        revenue: row._sum.totalAmount ?? 0
      })),
      byDeliveryMethod: byDeliveryMethod.map((row) => ({
        deliveryMethod: row.deliveryMethod,
        orders: row._count._all,
        revenue: row._sum.totalAmount ?? 0
      })),
      byPaymentMethod: byPaymentMethod.map((row) => ({
        paymentMethod: row.paymentMethod,
        orders: row._count._all,
        revenue: row._sum.totalAmount ?? 0
      }))
    };
  }

  private buildWhere(params: {
    status?: string;
    customerName?: string;
    fromDate?: string;
    toDate?: string;
  }): Prisma.OrderWhereInput {
    return {
      ...(params.status ? { status: params.status as OrderStatus } : {}),
      ...(params.customerName
        ? { customer: { name: { contains: params.customerName, mode: "insensitive" } } }
        : {}),
      ...(params.fromDate || params.toDate
        ? {
            createdAt: {
              ...(params.fromDate ? { gte: new Date(params.fromDate) } : {}),
              ...(params.toDate ? { lte: new Date(params.toDate) } : {})
            }
          }
        : {})
    };
  }

  private orderInclude() {
    return {
      customer: true,
      batch: true,
      delivery: true,
      orderNotes: { orderBy: { createdAt: "desc" as const } }
    };
  }

  private serializeOrder(order: Prisma.OrderGetPayload<{ include: ReturnType<McpOrdersService["orderInclude"]> }>) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      location: order.location,
      address: order.address,
      preferredSchedule: order.preferredSchedule,
      scheduleReminderSentAt: order.scheduleReminderSentAt,
      items: order.items,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        id: order.customer.id,
        name: order.customer.name,
        phoneNumber: order.customer.phoneNumber,
        defaultAddress: order.customer.defaultAddress,
        notes: order.customer.notes,
        totalOrders: order.customer.totalOrders,
        totalSpent: order.customer.totalSpent,
        isVip: order.customer.isVip
      },
      batch: order.batch
        ? {
            id: order.batch.id,
            name: order.batch.name,
            batchDate: order.batch.batchDate,
            isClosed: order.batch.isClosed
          }
        : null,
      delivery: order.delivery
        ? {
            id: order.delivery.id,
            areaGroup: order.delivery.areaGroup,
            status: order.delivery.status,
            scheduledAt: order.delivery.scheduledAt,
            eta: order.delivery.eta,
            trackingLink: order.delivery.trackingLink,
            riderName: order.delivery.riderName,
            riderPlate: order.delivery.riderPlate,
            bookingNotes: order.delivery.bookingNotes,
            copyPayload: order.delivery.copyPayload
          }
        : null,
      orderNotes: order.orderNotes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt
      }))
    };
  }
}
