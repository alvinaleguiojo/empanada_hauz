import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiOrderActionService } from "../ai/ai-order-action.service";
import { MessengerService } from "./messenger.service";

interface LatestOrder {
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
    const latestOrder = await this.prisma.order.findFirst({
      where: { customerId: customer.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
    }) as LatestOrder | null;

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

    const reply = latestOrder
      ? this.formatLatestOrder(latestOrder)
      : "You don't have any orders yet. 😊";

    this.logger.log(`Sending latest order summary: sender=${senderId} order=${latestOrder?.orderNumber ?? "none"}`);
    await this.messengerService.sendText(senderId, reply);
    return true;
  }

  private formatLatestOrder(order: LatestOrder) {
    const items = this.normalizeItems(order.items);
    const itemLines = items.length
      ? items.map((item) => `• ${item.quantity} pcs ${item.name} — ₱${item.price.toFixed(2)} each = ₱${item.subtotal.toFixed(2)}`).join("\n")
      : `• ${order.quantity} pcs — ₱${order.unitPrice.toFixed(2)} each`;

    const delivery = order.deliveryMethod === "maxim" ? "Maxim" : order.deliveryMethod === "pickup" ? "Pickup" : this.titleCase(order.deliveryMethod);
    const payment = order.paymentMethod === "gcash" ? "GCash" : order.paymentMethod === "cod" ? "COD" : this.titleCase(order.paymentMethod);
    const schedule = order.preferredSchedule ? this.formatSchedule(order.preferredSchedule) : "Not specified";
    const address = order.address?.trim() || "Not specified";
    const landmark = order.location?.trim() || "Not specified";
    const contact = order.customer.phoneNumber?.trim() || "Not specified";

    return [
      `Here’s your latest order, ${order.customer.name?.trim() || "Customer"}:`,
      "",
      `Order #: ${order.orderNumber}`,
      `Status: ${this.titleCase(order.status)}`,
      "",
      "Items:",
      itemLines,
      "",
      `Food total: ₱${this.foodTotal(order).toFixed(2)}`,
      `Delivery fee: ₱${Number(order.deliveryFee || 0).toFixed(2)}`,
      `Discount: ₱${Number(order.discountAmount || 0).toFixed(2)}`,
      `Total: ₱${Number(order.totalAmount || 0).toFixed(2)}`,
      "",
      `Delivery: ${delivery}`,
      `Address: ${address}`,
      `Landmark: ${landmark}`,
      `Contact #: ${contact}`,
      `Payment: ${payment}`,
      `Schedule: ${schedule}`
    ].join("\n");
  }

  private foodTotal(order: LatestOrder) {
    const deliveryFee = Number(order.deliveryFee || 0);
    const discount = Number(order.discountAmount || 0);
    const total = Number(order.totalAmount || 0);
    return Math.max(0, total - deliveryFee + discount);
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

  private titleCase(value: string) {
    return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
