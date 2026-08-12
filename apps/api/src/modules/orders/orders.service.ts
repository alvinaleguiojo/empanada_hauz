import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeGateway } from "../../common/realtime.gateway";
import { BatchesService } from "../batches/batches.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ReferralsService } from "../referrals/referrals.service";
import { GoogleDriveOrderExportService } from "./google-drive-order-export.service";
import { GoogleSheetsOrderSyncService } from "./google-sheets-order-sync.service";
import { CreateOrderDto, ManualOrderEntryDto, OrderLineItemDto, OrderStatus, PublicOrderEntryDto, UpdateOrderDto } from "./dto";
import { priceForFlavor } from "./menu-prices";

const MINIMUM_PUBLIC_ORDER_QUANTITY = 10;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly batchesService: BatchesService,
    private readonly googleSheetsOrderSync: GoogleSheetsOrderSyncService,
    private readonly googleDriveOrderExport: GoogleDriveOrderExportService,
    private readonly notificationsService: NotificationsService,
    private readonly referralsService: ReferralsService
  ) {}

  async list({ date, search }: { date?: string; search?: string } = {}) {
    const filters = [
      date ? this.buildDateFilter(date) : undefined,
      search ? this.buildSearchFilter(search) : undefined
    ].filter((filter): filter is Prisma.OrderWhereInput => Boolean(filter));
    const where = filters.length > 1 ? { AND: filters } : filters[0];

    return this.prisma.order.findMany({
      where,
      include: {
        customer: true,
        batch: true,
        delivery: true,
        orderNotes: { orderBy: { createdAt: "desc" } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  private buildDateFilter(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return undefined;
    }

    const start = new Date(`${date}T00:00:00+08:00`);
    if (Number.isNaN(start.getTime())) {
      return undefined;
    }

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return {
      OR: [
        { preferredSchedule: { gte: start, lt: end } },
        {
          createdAt: { gte: start, lt: end },
          OR: [
            { preferredSchedule: null },
            { preferredSchedule: { isSet: false } }
          ]
        }
      ]
    };
  }

  private buildSearchFilter(search: string): Prisma.OrderWhereInput | undefined {
    const query = search.trim();
    if (!query) {
      return undefined;
    }

    return {
      OR: [
        { orderNumber: { contains: query, mode: "insensitive" } },
        { location: { contains: query, mode: "insensitive" } },
        { address: { contains: query, mode: "insensitive" } },
        { notes: { contains: query, mode: "insensitive" } },
        { customer: { name: { contains: query, mode: "insensitive" } } },
        { customer: { phoneNumber: { contains: query, mode: "insensitive" } } },
        { delivery: { areaGroup: { contains: query, mode: "insensitive" } } },
        { delivery: { riderName: { contains: query, mode: "insensitive" } } },
        { delivery: { riderPlate: { contains: query, mode: "insensitive" } } },
        { orderNotes: { some: { body: { contains: query, mode: "insensitive" } } } }
      ]
    };
  }

  async track(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        delivery: true,
        orderNotes: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      discountAmount: order.discountAmount,
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      location: order.location,
      address: order.address,
      preferredSchedule: order.preferredSchedule,
      items: order.items,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        name: order.customer.name,
        phoneNumber: order.customer.phoneNumber
      },
      delivery: order.delivery
        ? {
            status: order.delivery.status,
            areaGroup: order.delivery.areaGroup,
            scheduledAt: order.delivery.scheduledAt,
            eta: order.delivery.eta,
            trackingLink: order.delivery.trackingLink,
            riderName: order.delivery.riderName,
            riderPlate: order.delivery.riderPlate,
            bookingNotes: order.delivery.bookingNotes,
            copyPayload: order.delivery.copyPayload,
            updatedAt: order.delivery.updatedAt
          }
        : null,
      orderNotes: order.orderNotes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt
      }))
    };
  }

  async create(dto: CreateOrderDto) {
    const batch = await this.batchesService.assignBatch(dto.quantity);
    const deliveryFee = dto.deliveryFee ?? 0;
    const discountAmount = dto.discountAmount ?? 0;
    const totalAmount = Math.max(0, dto.quantity * dto.unitPrice + deliveryFee - discountAmount);

    const order = await this.prisma.order.create({
      data: {
        orderNumber: `EMP-${Date.now()}`,
        customerId: dto.customerId,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        totalAmount,
        deliveryFee,
        discountAmount,
        deliveryMethod: dto.deliveryMethod,
        paymentMethod: dto.paymentMethod ?? "cod",
        location: dto.location,
        address: dto.address,
        preferredSchedule: dto.preferredSchedule ? new Date(dto.preferredSchedule) : undefined,
        scheduleReminderSentAt: null,
        items: dto.items,
        notes: dto.notes,
        ...(dto.notes?.trim() ? { orderNotes: { create: { body: dto.notes.trim() } } } : {}),
        batchId: batch?.id,
        status: batch ? "queued" : "awaiting_confirmation"
      },
      include: {
        customer: true,
        batch: true,
        orderNotes: { orderBy: { createdAt: "desc" } }
      }
    });

    this.realtime.emit("orders.updated", order);
    this.notifyOrderCreated(order);
    await this.googleSheetsOrderSync.appendOrder(order);
    return order;
  }

  async createPublic(dto: PublicOrderEntryDto) {
    // Public submissions are untrusted input: never accept client-supplied
    // prices. Every line item must reference a known menu flavor, and the
    // price/subtotal are always recomputed here from the server-side menu.
    const trustedItems = this.resolveTrustedLineItems(dto.items);

    const totalQuantity = trustedItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity < MINIMUM_PUBLIC_ORDER_QUANTITY) {
      throw new BadRequestException(`Minimum order is ${MINIMUM_PUBLIC_ORDER_QUANTITY} pieces.`);
    }
    const totalAmount = trustedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const unitPrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0;

    const order = await this.createManual({
      customerName: dto.customerName,
      phoneNumber: dto.phoneNumber,
      quantity: totalQuantity,
      unitPrice,
      deliveryMethod: dto.deliveryMethod,
      paymentMethod: dto.paymentMethod,
      address: dto.address,
      location: dto.landmark,
      preferredSchedule: dto.preferredSchedule,
      items: trustedItems,
      notes: dto.notes
    });

    await this.referralsService.recordOrderReferral({
      referralCode: dto.referralCode,
      customerId: order.customer.id,
      customerName: order.customer.name,
      phoneNumber: order.customer.phoneNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderTotal: Number(order.totalAmount ?? 0),
      status: order.status
    });

    return {
      order,
      trackingPath: `/track/${order.id}`
    };
  }

  /**
   * Validates each line item against the authoritative menu price list and
   * returns items with server-computed price/subtotal. Rejects unknown
   * flavors and non-positive quantities. This is the enforcement point that
   * prevents a caller from bypassing the UI and submitting arbitrary prices
   * directly to POST /orders/public.
   */
  private resolveTrustedLineItems(items: OrderLineItemDto[] | undefined) {
    if (!items || items.length === 0) {
      throw new BadRequestException("At least one order item is required.");
    }

    return items.map((item) => {
      const quantity = Math.trunc(Number(item.quantity));
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new BadRequestException(`Invalid quantity for "${item.name}".`);
      }

      const trustedPrice = priceForFlavor(item.name);
      if (trustedPrice === undefined) {
        throw new BadRequestException(`Unknown flavor: "${item.name}".`);
      }

      return {
        name: item.name,
        quantity,
        price: trustedPrice,
        subtotal: quantity * trustedPrice
      };
    });
  }

  async createManual(dto: ManualOrderEntryDto) {
    const reusableCustomer = await this.findReusableCustomer(dto);
    const customer = reusableCustomer
      ? await this.prisma.customer.update({
          where: { id: reusableCustomer.id },
          data: {
            name: dto.customerName,
            ...(dto.phoneNumber ? { phoneNumber: dto.phoneNumber } : {}),
            ...(dto.address ? { defaultAddress: dto.address } : {}),
            preferredDeliveryMethod: dto.deliveryMethod
          }
        })
      : await this.prisma.customer.create({
          data: {
            name: dto.customerName,
            phoneNumber: dto.phoneNumber,
            defaultAddress: dto.address,
            preferredDeliveryMethod: dto.deliveryMethod
          }
        });

    const batch = dto.status && ["ready_for_booking", "booked", "completed", "cancelled"].includes(dto.status)
      ? null
      : await this.batchesService.assignBatch(dto.quantity);
    const deliveryFee = dto.deliveryFee ?? 0;
    const discountAmount = dto.discountAmount ?? 0;
    const lineItems = dto.items && dto.items.length > 0 ? dto.items : [];
    const orderQuantity = lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || dto.quantity;
    const itemSubtotal = lineItems.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const subtotal = item.subtotal ?? quantity * price;
      return sum + (Number(subtotal) || 0);
    }, 0);
    const totalAmount = Math.max(0, (lineItems.length > 0 ? itemSubtotal : dto.quantity * dto.unitPrice) + deliveryFee - discountAmount);
    const unitPrice = lineItems.length > 0 && orderQuantity > 0 ? itemSubtotal / orderQuantity : dto.unitPrice;
    const order = await this.prisma.order.create({
      data: {
        orderNumber: `EMP-${Date.now()}`,
        customerId: customer.id,
        quantity: orderQuantity,
        unitPrice,
        totalAmount,
        deliveryFee,
        discountAmount,
        deliveryMethod: dto.deliveryMethod,
        paymentMethod: dto.paymentMethod ?? "cod",
        location: dto.location,
        address: dto.address,
        preferredSchedule: dto.preferredSchedule ? new Date(dto.preferredSchedule) : undefined,
        scheduleReminderSentAt: null,
        items: dto.items,
        notes: dto.notes,
        ...(dto.notes?.trim() ? { orderNotes: { create: { body: dto.notes.trim() } } } : {}),
        batchId: batch?.id,
        status: dto.status ?? (batch ? "queued" : "awaiting_confirmation")
      },
      include: {
        customer: true,
        batch: true,
        delivery: true,
        orderNotes: { orderBy: { createdAt: "desc" } }
      }
    });

    this.realtime.emit("orders.updated", order);
    this.notifyOrderCreated(order);
    await this.googleSheetsOrderSync.appendOrder(order);
    if (order.status === "ready_for_booking" || order.status === "booked") {
      this.realtime.emit("deliveries.updated", {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name,
        status: order.status
      });
    }
    return order;
  }

  private notifyOrderCreated(order: {
    id: string;
    orderNumber: string;
    quantity: number;
    totalAmount: unknown;
    deliveryMethod: string;
    paymentMethod: string;
    status: string;
    customer?: { name?: string | null; phoneNumber?: string | null } | null;
  }) {
    this.notificationsService.notify("order.created", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name,
      phoneNumber: order.customer?.phoneNumber,
      quantity: order.quantity,
      totalAmount: order.totalAmount,
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      status: order.status
    });
  }

  private async findReusableCustomer(dto: Pick<ManualOrderEntryDto, "customerName" | "phoneNumber" | "address">) {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    const name = normalizeCustomerName(dto.customerName);
    const address = normalizeCustomerAddress(dto.address);

    if (!phoneNumber && !name) {
      return null;
    }

    const candidates = await this.prisma.customer.findMany({
      where: {
        OR: [
          ...(dto.phoneNumber ? [{ phoneNumber: dto.phoneNumber }] : []),
          { name: dto.customerName }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: 25
    });

    const phoneMatch = phoneNumber ? candidates.find((customer) => normalizePhoneNumber(customer.phoneNumber) === phoneNumber) : null;
    if (phoneMatch) {
      return phoneMatch;
    }

    if (!name || !name.includes(" ")) {
      return null;
    }

    const nameMatches = candidates.filter((customer) => normalizeCustomerName(customer.name) === name);
    if (address) {
      const addressMatch = nameMatches.find((customer) => normalizeCustomerAddress(customer.defaultAddress) === address);
      if (addressMatch) {
        return addressMatch;
      }
    }

    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  async updateStatus(id: string, status: OrderStatus) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Order not found");
    }

    const order = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: {
        customer: true,
        batch: true,
        delivery: true,
        orderNotes: { orderBy: { createdAt: "desc" } }
      }
    });

    this.realtime.emit("orders.updated", order);
    this.realtime.emit("kitchen.updated", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name,
      status: order.status
    });
    return order;
  }

  async update(id: string, dto: UpdateOrderDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true, batch: true, delivery: true, orderNotes: true }
    });

    if (!existing) {
      throw new NotFoundException("Order not found");
    }

    const quantity = dto.quantity ?? existing.quantity;
    const unitPrice = dto.unitPrice ?? Number(existing.unitPrice);
    const deliveryFee = dto.deliveryFee ?? Number(existing.deliveryFee);
    const discountAmount = dto.discountAmount ?? Number(existing.discountAmount);
    const totalAmount = Math.max(0, quantity * unitPrice + deliveryFee - discountAmount);

    const order = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: existing.customerId },
        data: {
          ...(dto.customerName !== undefined ? { name: dto.customerName } : {}),
          ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber } : {}),
          ...(dto.address !== undefined ? { defaultAddress: dto.address } : {}),
          ...(dto.deliveryMethod !== undefined ? { preferredDeliveryMethod: dto.deliveryMethod } : {})
        }
      });

      return tx.order.update({
        where: { id },
        data: {
          ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
          ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
          totalAmount,
          ...(dto.deliveryFee !== undefined ? { deliveryFee } : {}),
          ...(dto.discountAmount !== undefined ? { discountAmount } : {}),
          ...(dto.deliveryMethod !== undefined ? { deliveryMethod: dto.deliveryMethod } : {}),
          ...(dto.paymentMethod !== undefined ? { paymentMethod: dto.paymentMethod } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.preferredSchedule !== undefined
            ? {
                preferredSchedule: dto.preferredSchedule ? new Date(dto.preferredSchedule) : null,
                scheduleReminderSentAt: null
              }
            : {}),
          ...(dto.items !== undefined ? { items: dto.items } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {})
        },
        include: {
          customer: true,
          batch: true,
          delivery: true,
          orderNotes: { orderBy: { createdAt: "desc" } }
        }
      });
    });

    this.realtime.emit("orders.updated", order);
    return order;
  }

  async addNote(id: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) {
      throw new BadRequestException("Note cannot be empty");
    }

    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Order not found");
    }

    await this.prisma.orderNote.create({
      data: {
        orderId: id,
        body: trimmed
      }
    });

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        customer: true,
        batch: true,
        delivery: true,
        orderNotes: { orderBy: { createdAt: "desc" } }
      }
    });

    this.realtime.emit("orders.updated", order);
    return order;
  }

  async remove(id: string) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true, delivery: true }
    });

    if (!existing) {
      throw new NotFoundException("Order not found");
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.delete({
        where: { id },
        include: { customer: true, batch: true, delivery: true }
      });

      const [remainingOrders, conversationCount] = await Promise.all([
        tx.order.count({ where: { customerId: order.customerId } }),
        tx.conversation.count({ where: { customerId: order.customerId } })
      ]);

      if (remainingOrders === 0 && conversationCount === 0 && !order.customer.messengerPsid) {
        await tx.customer.delete({ where: { id: order.customerId } });
      }

      if (order.deliveryId) {
        const linkedOrders = await tx.order.count({ where: { deliveryId: order.deliveryId } });
        if (linkedOrders === 0) {
          await tx.delivery.delete({ where: { id: order.deliveryId } });
        }
      }

      return order;
    });

    this.realtime.emit("orders.deleted", {
      id: deleted.id,
      orderNumber: deleted.orderNumber,
      customerName: deleted.customer?.name,
      status: deleted.status
    });
    this.realtime.emit("kitchen.updated", {
      orderId: deleted.id,
      orderNumber: deleted.orderNumber,
      customerName: deleted.customer?.name,
      status: "deleted"
    });
    if (deleted.deliveryId) {
      this.realtime.emit("deliveries.updated", {
        orderId: deleted.id,
        orderNumber: deleted.orderNumber,
        customerName: deleted.customer?.name,
        status: "deleted"
      });
    }
    return deleted;
  }

  async exportToGoogleDrive(orderIds: string[]) {
    if (!orderIds.length) {
      throw new BadRequestException("No orders selected for export");
    }

    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: {
        customer: true,
        orderNotes: { orderBy: { createdAt: "desc" } }
      }
    });
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const sortedOrders = orderIds.map((id) => orderById.get(id)).filter((order): order is NonNullable<typeof order> => Boolean(order));

    if (!sortedOrders.length) {
      throw new BadRequestException("No matching orders found for export");
    }

    return this.googleDriveOrderExport.uploadOrders(sortedOrders);
  }

  async createFromAi(params: {
    customerId: string;
    conversationId: string;
    quantity: number;
    location?: string;
    address?: string;
    preferredTime?: string;
    deliveryMethod: "pickup" | "maxim";
    paymentMethod?: "cod" | "gcash";
    notes?: string;
  }) {
    return this.create({
      customerId: params.customerId,
      quantity: params.quantity,
      unitPrice: 18,
      deliveryMethod: params.deliveryMethod,
      paymentMethod: params.paymentMethod ?? "cod",
      location: params.location,
      address: params.address,
      preferredSchedule: params.preferredTime
        ? new Date(`${new Date().toISOString().slice(0, 10)}T${this.normalizeTime(params.preferredTime)}:00+08:00`).toISOString()
        : undefined,
      notes: params.notes
    });
  }

  private normalizeTime(value: string) {
    const lower = value.toLowerCase().trim();
    if (lower.endsWith("pm")) {
      const hour = Number(lower.replace("pm", "").trim());
      return `${String(hour === 12 ? 12 : hour + 12).padStart(2, "0")}:00`;
    }
    if (lower.endsWith("am")) {
      const hour = Number(lower.replace("am", "").trim());
      return `${String(hour === 12 ? 0 : hour).padStart(2, "0")}:00`;
    }
    return "16:00";
  }

}

function normalizePhoneNumber(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function normalizeCustomerName(value?: string | null) {
  return value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ") ?? "";
}

function normalizeCustomerAddress(value?: string | null) {
  return value
    ?.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ") ?? "";
}
