import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DeliveryMethod, PaymentMethod } from "../orders/dto";
import { PrismaService } from "../../database/prisma.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { ProductsService } from "../products/products.service";
import { AiDateTimeService } from "./ai-datetime.service";

export type AiApplicationToolName =
  | "get_current_datetime"
  | "get_order_summary"
  | "get_my_orders"
  | "check_order_status"
  | "create_order"
  | "update_order"
  | "cancel_order"
  | "delete_order";

@Injectable()
export class AiApplicationToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpOrdersService: McpOrdersService,
    private readonly productsService: ProductsService,
    private readonly aiDateTimeService: AiDateTimeService
  ) {}

  async execute(tool: AiApplicationToolName, args: Record<string, unknown>) {
    switch (tool) {
      case "get_current_datetime": return this.aiDateTimeService.now();
      case "get_order_summary": return this.getCustomerOrderSummary(this.stringArg(args.customerId), this.stringArg(args.orderNumber), this.stringArg(args.id));
      case "get_my_orders": return this.getMyOrders(this.stringArg(args.customerId), Number(args.limit));
      case "check_order_status": return this.getCustomerOrderStatus(this.stringArg(args.customerId), this.stringArg(args.orderNumber), this.stringArg(args.id));
      case "create_order": return this.createCustomerOrder(args);
      case "update_order": return this.updateCustomerOrder(this.stringArg(args.customerId), args);
      case "cancel_order": return this.cancelCustomerOrder(this.stringArg(args.customerId), this.stringArg(args.orderNumber), this.stringArg(args.id), args.confirmed === true);
      case "delete_order": return this.deleteCustomerOrder(this.stringArg(args.customerId), this.stringArg(args.orderNumber), this.stringArg(args.id), args.confirmed === true);
    }
  }

  private async getCustomerOrderSummary(customerId: string, orderNumber?: string, id?: string) {
    const order = await this.findCustomerOrder(customerId, orderNumber, id);
    return this.mcpOrdersService.getOrder({ id: order.id });
  }

  private async getMyOrders(customerId: string, requestedLimit?: number) {
    if (!customerId) throw new BadRequestException("Customer context is required.");
    const numericLimit = Number(requestedLimit);
    const limit = Number.isFinite(numericLimit) ? Math.min(Math.max(Math.trunc(numericLimit), 1), 20) : 10;
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        quantity: true,
        totalAmount: true,
        deliveryFee: true,
        deliveryMethod: true,
        paymentMethod: true,
        address: true,
        location: true,
        preferredSchedule: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  private async getCustomerOrderStatus(customerId: string, orderNumber?: string, id?: string) {
    const order = await this.findCustomerOrder(customerId, orderNumber, id);
    return { id: order.id, orderNumber: order.orderNumber, status: order.status, quantity: order.quantity, deliveryMethod: order.deliveryMethod, preferredSchedule: order.preferredSchedule, totalAmount: order.totalAmount, deliveryFee: order.deliveryFee };
  }

  private async createCustomerOrder(args: Record<string, unknown>) {
    if (args.confirmed !== true) throw new BadRequestException("Explicit customer confirmation is required before creating an order.");
    const customerId = this.stringArg(args.customerId);
    const existingCustomer = customerId ? await this.prisma.customer.findUnique({ where: { id: customerId } }) : null;
    const customerName = this.stringArg(args.customerName) || existingCustomer?.name?.trim() || "";
    const phoneNumber = this.stringArg(args.phoneNumber) || existingCustomer?.phoneNumber?.trim() || undefined;
    const quantity = Number(args.quantity);
    const items = this.normalizeItems(args.items);
    const deliveryMethod = this.parseDeliveryMethod(args.deliveryMethod);
    const paymentMethod = this.parsePaymentMethod(args.paymentMethod);
    if (!customerName || !Number.isFinite(quantity) || quantity < 10 || !items.length) throw new BadRequestException("A confirmed order requires customerName, at least 10 pieces, and at least one product item.");
    const productItems = [];
    let totalQuantity = 0;
    for (const item of items) {
      const product = await this.productsService.resolveByName(item.name, { requireAvailable: true });
      if (!product) throw new BadRequestException(`Product is unavailable: ${item.name}`);
      productItems.push({ name: product.name, quantity: item.quantity, price: product.price, subtotal: product.price * item.quantity });
      totalQuantity += item.quantity;
    }
    if (totalQuantity !== Math.trunc(quantity)) throw new BadRequestException("Item quantities must match the requested order quantity.");
    if (!deliveryMethod) throw new BadRequestException("A valid delivery method is required.");
    if (!paymentMethod) throw new BadRequestException("A valid payment method is required.");

    const savedAddress = existingCustomer?.defaultAddress?.trim() || undefined;
    const location = this.stringArg(args.location) || savedAddress;
    const address = this.stringArg(args.address) || savedAddress;
    if (deliveryMethod === "maxim" && (!address || !location || !phoneNumber)) throw new BadRequestException("Maxim delivery requires address, landmark/location, and contact number.");

    const payload: Parameters<McpOrdersService["createOrder"]>[0] = {
      customerName,
      phoneNumber,
      quantity: Math.trunc(quantity),
      deliveryMethod,
      paymentMethod,
      location,
      address,
      preferredSchedule: this.normalizePreferredSchedule(this.stringArg(args.preferredSchedule)) || undefined,
      items: productItems,
      notes: this.stringArg(args.notes) || undefined
    };
    return this.mcpOrdersService.createOrder(payload);
  }

  private async updateCustomerOrder(customerId: string, args: Record<string, unknown>) {
    const order = await this.findCustomerOrder(customerId, this.stringArg(args.orderNumber), this.stringArg(args.id));
    const hasScheduleChange = args.preferredSchedule !== undefined;
    if (hasScheduleChange && order.status !== "queued") {
      throw new BadRequestException(`This order can only be rescheduled while it is queued. Current status: ${order.status}.`);
    }
    const payload = { ...args, id: order.id } as Parameters<McpOrdersService["updateOrder"]>[0];
    delete (payload as Record<string, unknown>).customerId;
    delete (payload as Record<string, unknown>).confirmed;
    if (hasScheduleChange) {
      const normalizedSchedule = this.normalizePreferredSchedule(this.stringArg(args.preferredSchedule));
      if (!normalizedSchedule) throw new BadRequestException("The requested schedule could not be understood. Please provide an exact date or a date and time.");
      payload.preferredSchedule = normalizedSchedule;
    }
    return this.mcpOrdersService.updateOrder(payload);
  }

  private normalizePreferredSchedule(value: string) {
    const raw = value.trim();
    if (!raw) return undefined;

    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)) return raw;

    const current = this.aiDateTimeService.now();
    const currentDate = new Date(`${current.date}T00:00:00+08:00`);
    const lowered = raw.toLowerCase().replace(/\s+/g, " ").trim();
    const timeMatch = lowered.match(/(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    const time = timeMatch ? this.parseTime(timeMatch[1], timeMatch[2], timeMatch[3]) : undefined;
    const datePhrase = timeMatch ? lowered.slice(0, timeMatch.index).trim() : lowered;
    if (!datePhrase) return undefined;

    let targetDate: Date | undefined;
    if (datePhrase === "today") {
      targetDate = currentDate;
    } else if (datePhrase === "tomorrow") {
      targetDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    } else if (datePhrase === "day after tomorrow") {
      targetDate = new Date(currentDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    } else {
      const weekday = datePhrase.replace(/^(next|this)\s+/, "");
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const targetDay = weekdays.indexOf(weekday);
      if (targetDay >= 0) {
        const dayDifference = (targetDay - currentDate.getDay() + 7) % 7 || 7;
        targetDate = new Date(currentDate.getTime() + dayDifference * 24 * 60 * 60 * 1000);
      }
    }

    if (!targetDate) return undefined;
    const date = this.formatManilaDate(targetDate);
    if (!time) return date;
    return `${date}T${time}+08:00`;
  }

  private parseTime(hourValue: string, minuteValue?: string, meridiem?: string) {
    let hour = Number(hourValue);
    const minute = Number(minuteValue ?? "0");
    if (!Number.isFinite(hour) || hour < 1 || hour > 12 || !Number.isFinite(minute) || minute < 0 || minute > 59) return undefined;
    if (meridiem?.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (meridiem?.toLowerCase() === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  }

  private formatManilaDate(date: Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: this.aiDateTimeService.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  private async cancelCustomerOrder(customerId: string, orderNumber?: string, id?: string, confirmed = false) {
    if (!confirmed) throw new BadRequestException("Explicit customer confirmation is required before cancellation.");
    const order = await this.findCustomerOrder(customerId, orderNumber, id);
    if (order.status !== "queued") throw new BadRequestException(`This order can only be cancelled while it is queued. Current status: ${order.status}.`);
    return this.mcpOrdersService.updateOrder({ id: order.id, status: "cancelled" });
  }

  private async deleteCustomerOrder(_customerId: string, _orderNumber?: string, _id?: string, _confirmed = false) {
    throw new BadRequestException("Customer orders cannot be deleted through AI. Use cancellation instead when the order is still queued.");
  }

  private async findCustomerOrder(customerId: string, orderNumber?: string, id?: string) {
    if (!customerId) throw new BadRequestException("Customer context is required.");
    const normalizedId = this.stringArg(id);
    const normalizedOrderNumber = this.stringArg(orderNumber);
    const candidateIds = [normalizedId, normalizedOrderNumber].filter((value, index, values) => Boolean(value) && this.isObjectId(value) && values.indexOf(value) === index);

    for (const candidateId of candidateIds) {
      const byId = await this.prisma.order.findFirst({ where: { id: candidateId, customerId, status: { notIn: ["completed", "cancelled"] } } });
      if (byId) return byId;
    }

    if (normalizedOrderNumber) {
      const byOrderNumber = await this.prisma.order.findFirst({ where: { orderNumber: normalizedOrderNumber, customerId, status: { notIn: ["completed", "cancelled"] } } });
      if (byOrderNumber) return byOrderNumber;
    }
    throw new NotFoundException("No active order was found for this customer.");
  }

  private isObjectId(value?: string) { return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value.trim()); }
  private normalizeItems(value: unknown) {
    if (!Array.isArray(value)) return [] as Array<{ name: string; quantity: number }>;
    return value.map((item) => ({ name: typeof item?.name === "string" ? item.name.trim() : "", quantity: Math.trunc(Number(item?.quantity)) })).filter((item) => item.name && Number.isFinite(item.quantity) && item.quantity > 0);
  }

  private parseDeliveryMethod(value: unknown): DeliveryMethod | undefined {
    return value === "pickup" || value === "maxim" ? value : undefined;
  }

  private parsePaymentMethod(value: unknown): PaymentMethod | undefined {
    return value === "cod" || value === "gcash" ? value : undefined;
  }

  private stringArg(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : ""; }
}
