import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiOrderActionService } from "../ai/ai-order-action.service";
import { MessengerService } from "./messenger.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";

interface OrderSummary {
  orderNumber: string;
  status: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  deliveryFee: number;
  discountAmount: number;
  deliveryMethod: string;
  paymentMethod: string;
  location: string | null;
  address: string | null;
  preferredSchedule: Date | null;
  items: unknown;
  createdAt: Date;
  customer: { name: string; phoneNumber: string | null };
}

@Injectable()
export class MessengerOrderSummaryService {
  private readonly logger = new Logger(MessengerOrderSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly aiOrderActionService: AiOrderActionService,
    private readonly messengerService: MessengerService,
    private readonly mcpOrdersService: McpOrdersService
  ) {}

  async tryHandle(senderId: string, message: string): Promise<boolean> {
    const actionContext = await this.getActionContext(senderId, message);
    if (actionContext?.orderAction === "cancel_existing") {
      return this.handleCancellation(
        senderId,
        actionContext.hasActiveOrder,
        actionContext.customerId,
        this.extractOrderNumber(message)
      );
    }

    if (!this.isSummaryRequest(message)) return false;

    const profileName = await this.messengerService.getMessengerProfileName(senderId);
    const customer = await this.customersService.findOrCreateByMessenger(
      senderId,
      profileName?.trim() || "Messenger Customer"
    );

    const orderNumber = this.extractOrderNumber(message);
    let recentOrders: OrderSummary[];
    let lookupMode = "customer";

    if (orderNumber) {
      const directOrder = await this.prisma.order.findFirst({
        where: { orderNumber, customerId: customer.id },
        select: this.orderSelect()
      }) as OrderSummary | null;

      if (directOrder) {
        recentOrders = [directOrder];
        lookupMode = "order-number";
      } else {
        recentOrders = await this.findOrdersByCustomer(customer.id, profileName ?? null);
      }
    } else {
      recentOrders = await this.findOrdersByCustomer(customer.id, profileName ?? null);
    }

    const latestOrder = recentOrders[0] ?? null;
    this.logger.log(
      `Messenger summary lookup: sender=${senderId} profile=${profileName ?? "none"} customer=${customer.id} customerName=${customer.name} mode=${lookupMode} orderNumber=${orderNumber ?? "none"} orders=${recentOrders.length}`
    );

    const reply = recentOrders.length
      ? this.formatOrderHistory(recentOrders)
      : "You don't have any orders yet. 😊";

    this.logger.log(
      `Sending recent order summary: sender=${senderId} customer=${customer.id} orders=${recentOrders.length} latest=${latestOrder?.orderNumber ?? "none"}`
    );
    await this.messengerService.sendText(senderId, reply);
    return true;
  }

  private async getActionContext(senderId: string, message: string) {
    try {
      const profileName = await this.messengerService.getMessengerProfileName(senderId);
      const customer = await this.customersService.findOrCreateByMessenger(senderId, profileName?.trim() || "Messenger Customer");
      const conversation = await this.prisma.conversation.findFirst({
        where: { customerId: customer.id, channel: "messenger" },
        orderBy: { updatedAt: "desc" },
        select: { id: true }
      });
      const recentMessages = conversation
        ? await this.prisma.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: "desc" },
            take: 16,
            select: { direction: true, content: true }
          })
        : [];
      const latestOrder = await this.prisma.order.findFirst({
        where: { customerId: customer.id, status: { notIn: ["completed", "cancelled"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { orderNumber: true, status: true, deliveryMethod: true, address: true, location: true, paymentMethod: true, customer: { select: { phoneNumber: true } } }
      });
      const action = await this.aiOrderActionService.analyze(message, {
        recentMessages: recentMessages.slice().reverse().map((item) => `${item.direction === "inbound" ? "Customer" : "Assistant"}: ${item.content}`),
        hasActiveOrder: Boolean(latestOrder),
        hasPendingNewOrder: false,
        existingDeliveryDetails: latestOrder ? { deliveryMethod: latestOrder.deliveryMethod, address: latestOrder.address, location: latestOrder.location, contactNumber: latestOrder.customer.phoneNumber, paymentMethod: latestOrder.paymentMethod } : undefined
      });
      return { ...action, hasActiveOrder: Boolean(latestOrder), customerId: customer.id, orderNumber: latestOrder?.orderNumber ?? null };
    } catch (error) {
      this.logger.warn(`Messenger action lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async handleCancellation(senderId: string, hasActiveOrder: boolean, customerId: string, requestedOrderNumber: string | null) {
    const latestOrder = await this.prisma.order.findFirst({
      where: requestedOrderNumber
        ? { customerId, orderNumber: requestedOrderNumber }
        : { customerId, status: { notIn: ["completed", "cancelled"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, orderNumber: true, status: true }
    });

    if (!latestOrder || (!hasActiveOrder && !requestedOrderNumber)) {
      await this.messengerService.sendText(senderId, "I couldn't find an active order that can be cancelled. 😊");
      return true;
    }

    if (latestOrder.status !== "queued") {
      await this.messengerService.sendText(
        senderId,
        `I can only cancel an order while it is still queued. Order #${latestOrder.orderNumber} is currently ${this.titleCase(latestOrder.status)} and can no longer be cancelled. 😊`
      );
      return true;
    }

    try {
      const cancelled = await this.mcpOrdersService.updateOrder({
        orderNumber: latestOrder.orderNumber,
        status: "cancelled"
      });
      this.logger.log(`Cancelled queued Messenger order ${latestOrder.orderNumber} for ${senderId}`);
      await this.messengerService.sendText(senderId, `Your order #${cancelled.orderNumber} has been cancelled successfully. 😊`);
    } catch (error) {
      this.logger.error(`Customer order cancellation failed for ${senderId}`, error instanceof Error ? error.stack : String(error));
      await this.messengerService.sendText(senderId, "I couldn't cancel the order right now. Please try again.");
    }
    return true;
  }

  private async findOrdersByCustomer(customerId: string, profileName: string | null) {
    const directOrders = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: this.orderSelect()
    });

    if (directOrders.length) return directOrders as OrderSummary[];

    const normalizedName = profileName?.trim();
    if (!normalizedName || normalizedName === "Messenger Customer") return [];

    const namedCustomers = await this.prisma.customer.findMany({
      where: { name: { equals: normalizedName, mode: Prisma.QueryMode.insensitive } },
      select: { id: true }
    });

    const customerIds = namedCustomers.map((candidate) => candidate.id);
    if (!customerIds.length) return [];

    const namedOrders = await this.prisma.order.findMany({
      where: { customerId: { in: customerIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: this.orderSelect()
    });

    if (namedOrders.length) {
      this.logger.log(`Messenger summary name fallback: name=${normalizedName} customerIds=${customerIds.length} orders=${namedOrders.length}`);
    }

    return namedOrders as OrderSummary[];
  }

  private orderSelect() {
    return {
      orderNumber: true,
      status: true,
      quantity: true,
      unitPrice: true,
      totalAmount: true,
      deliveryFee: true,
      discountAmount: true,
      deliveryMethod: true,
      paymentMethod: true,
      location: true,
      address: true,
      preferredSchedule: true,
      items: true,
      createdAt: true,
      customer: { select: { name: true, phoneNumber: true } }
    } satisfies Prisma.OrderSelect;
  }

  private extractOrderNumber(message: string) {
    const match = message.match(/(?:order(?:\s+(?:number|id))?\s*)?#?([A-Z]{2,10}-?\d{2,})\b/i);
    return match?.[1]?.toUpperCase() ?? null;
  }

  private isSummaryRequest(message: string) {
    const normalized = message.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return false;

    return (
      (/\b(summary|summarize|summarise)\b/.test(normalized) && /\border(s)?\b/.test(normalized))
      || /\b(order history|order histories|past orders|previous orders|recent orders)\b/.test(normalized)
      || /\b(show|send|list|display|check)\b.*\bmy orders\b/.test(normalized)
      || /\bwhat did i order\b/.test(normalized)
      || /\borders? (i|that i) (placed|made|ordered)\b/.test(normalized)
      || /\bwhat are my existing orders\b/.test(normalized)
      || /\bi (would like|want) to check (my|the) orders?\b/.test(normalized)
    );
  }

  private formatOrderHistory(orders: OrderSummary[]) {
    const customerName = orders[0]?.customer.name?.trim() || "Customer";
    const header = orders.length === 1
      ? `Here’s your latest order, ${customerName}:`
      : `Here are your ${orders.length} most recent orders, ${customerName}:`;

    return [
      header,
      "",
      ...orders.flatMap((order, index) => {
        const lines = [
          `🧾 Order ${index + 1}`,
          `Order #: ${order.orderNumber}`,
          `Status: ${this.titleCase(order.status)}`,
          "",
          this.formatItems(order),
          `💰 Total food amount: ₱${Number(order.totalAmount || 0).toFixed(2)}`,
          "",
          "🚚 Delivery",
          `Method: ${this.formatDelivery(order.deliveryMethod)}`,
          `💳 Payment: ${this.formatPayment(order.paymentMethod)}`
        ];

        if (order.preferredSchedule) lines.push(`📅 Schedule: ${this.formatSchedule(order.preferredSchedule)}`);
        if (order.deliveryMethod === "maxim" && order.address?.trim()) lines.push(`Address: ${order.address.trim()}`);
        if (order.deliveryMethod === "maxim" && order.location?.trim()) lines.push(`Landmark: ${order.location.trim()}`);

        return [...lines, "", "━━━━━━━━━━━━━━━━━━", ""];
      }),
      orders.length === 5 ? "Showing your 5 most recent orders." : ""
    ].filter(Boolean).join("\n").trim();
  }

  private formatItems(order: OrderSummary) {
    const items = this.normalizeItems(order.items);
    if (!items.length) return `🛒 Items: ${order.quantity} pcs — ₱${Number(order.unitPrice || 0).toFixed(2)} each`;
    return [
      "🛒 Items",
      ...items.map((item) => `• ${item.quantity} pcs ${item.name} — ₱${item.price.toFixed(2)} each = ₱${item.subtotal.toFixed(2)}`)
    ].join("\n");
  }

  private formatDelivery(value: string) { return value === "maxim" ? "Maxim" : value === "pickup" ? "Pickup" : this.titleCase(value); }
  private formatPayment(value: string) { return value === "gcash" ? "GCash" : value === "cod" ? "COD" : this.titleCase(value); }

  private normalizeItems(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const record = item as Record<string, unknown>;
      const quantity = Number(record.quantity ?? 0);
      const price = Number(record.price ?? record.unitPrice ?? 0);
      const subtotal = Number(record.subtotal ?? quantity * price);
      return {
        name: String(record.name ?? "Empanada"),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        price: Number.isFinite(price) ? price : 0,
        subtotal: Number.isFinite(subtotal) ? subtotal : 0
      };
    }).filter((item) => item.quantity > 0);
  }

  private formatSchedule(value: Date) {
    return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(value);
  }

  private titleCase(value: string) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
}
