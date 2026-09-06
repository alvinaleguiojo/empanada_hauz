import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiOrderActionService } from "../ai/ai-order-action.service";
import { MessengerService } from "./messenger.service";

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
    private readonly messengerService: MessengerService
  ) {}

  async tryHandle(senderId: string, message: string): Promise<boolean> {
    const customer = await this.customersService.findOrCreateByMessenger(senderId, "Messenger Customer");
    const recentOrders = await this.prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
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
      }
    }) as OrderSummary[];

    const latestOrder = recentOrders[0] ?? null;
    const recentMessages = await this.prisma.message.findMany({
      where: { conversation: { customerId: customer.id } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { direction: true, content: true }
    });
    const context = recentMessages.slice().reverse().map((item) => `${item.direction === "inbound" ? "Customer" : "Assistant"}: ${item.content}`);

    const action = await this.aiOrderActionService.analyze(message, {
      recentMessages: context,
      hasActiveOrder: Boolean(latestOrder && !["completed", "cancelled"].includes(latestOrder.status)),
      hasPendingNewOrder: false,
      existingDeliveryDetails: latestOrder
        ? {
            deliveryMethod: latestOrder.deliveryMethod,
            address: latestOrder.address,
            location: latestOrder.location,
            contactNumber: latestOrder.customer.phoneNumber,
            paymentMethod: latestOrder.paymentMethod
          }
        : undefined
    });

    if (action.orderAction !== "summary") return false;

    const reply = recentOrders.length
      ? this.formatOrderHistory(recentOrders)
      : "You don't have any orders yet. 😊";

    this.logger.log(`Sending recent order summary: sender=${senderId} customer=${customer.id} orders=${recentOrders.length} latest=${latestOrder?.orderNumber ?? "none"}`);
    await this.messengerService.sendText(senderId, reply);
    return true;
  }

  private formatOrderHistory(orders: OrderSummary[]) {
    const customerName = orders[0]?.customer.name?.trim() || "Customer";
    const header = orders.length === 1
      ? `Here’s your latest order, ${customerName}:`
      : `Here are your ${orders.length} most recent orders, ${customerName}:`;

    return [
      header,
      "",
      ...orders.flatMap((order, index) => [
        `Order ${index + 1}: #${order.orderNumber}`,
        `Placed: ${this.formatDate(order.createdAt)}`,
        `Status: ${this.titleCase(order.status)}`,
        this.formatItems(order),
        `Total: ₱${Number(order.totalAmount || 0).toFixed(2)}`,
        `Delivery: ${this.formatDelivery(order.deliveryMethod)}`,
        `Payment: ${this.formatPayment(order.paymentMethod)}`,
        `Schedule: ${order.preferredSchedule ? this.formatSchedule(order.preferredSchedule) : "Not specified"}`,
        ""
      ]),
      orders.length === 5 ? "Showing your 5 most recent orders." : ""
    ].filter(Boolean).join("\n")
      .trim();
  }

  private formatItems(order: OrderSummary) {
    const items = this.normalizeItems(order.items);
    if (!items.length) return `Items: ${order.quantity} pcs — ₱${Number(order.unitPrice || 0).toFixed(2)} each`;
    return [
      "Items:",
      ...items.map((item) => `• ${item.quantity} pcs ${item.name} — ₱${item.price.toFixed(2)} each = ₱${item.subtotal.toFixed(2)}`)
    ].join("\n");
  }

  private formatDelivery(value: string) {
    return value === "maxim" ? "Maxim" : value === "pickup" ? "Pickup" : this.titleCase(value);
  }

  private formatPayment(value: string) {
    return value === "gcash" ? "GCash" : value === "cod" ? "COD" : this.titleCase(value);
  }

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
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(value);
  }

  private formatDate(value: Date) {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium"
    }).format(value);
  }

  private titleCase(value: string) {
    return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
