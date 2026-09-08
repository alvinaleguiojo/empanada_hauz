import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DeliveryMethod, OrderStatus, PaymentMethod } from "../orders/dto";
import { PrismaService } from "../../database/prisma.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { ProductsService } from "../products/products.service";

export type AiApplicationToolName =
  | "get_order_summary"
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
    private readonly productsService: ProductsService
  ) {}

  async execute(tool: AiApplicationToolName, args: Record<string, unknown>) {
    switch (tool) {
      case "get_order_summary": return this.getCustomerOrderSummary(this.stringArg(args.customerId), this.stringArg(args.orderNumber), this.stringArg(args.id));
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
      preferredSchedule: this.stringArg(args.preferredSchedule) || undefined,
      items: productItems,
      notes: this.stringArg(args.notes) || undefined
    };
    return this.mcpOrdersService.createOrder(payload);
  }

  private async updateCustomerOrder(customerId: string, args: Record<string, unknown>) {
    const order = await this.findCustomerOrder(customerId, this.stringArg(args.orderNumber), this.stringArg(args.id));
    const payload = { ...args, id: order.id } as Parameters<McpOrdersService["updateOrder"]>[0];
    delete (payload as Record<string, unknown>).customerId;
    delete (payload as Record<string, unknown>).confirmed;
    return this.mcpOrdersService.updateOrder(payload);
  }

  private async cancelCustomerOrder(customerId: string, orderNumber?: string, id?: string, confirmed = false) {
    if (!confirmed) throw new BadRequestException("Explicit customer confirmation is required before cancellation.");
    const order = await this.findCustomerOrder(customerId, orderNumber, id);
    return this.mcpOrdersService.updateOrder({ id: order.id, status: "cancelled" });
  }

  private async deleteCustomerOrder(customerId: string, orderNumber?: string, id?: string, confirmed = false) {
    if (!confirmed) throw new BadRequestException("Explicit customer confirmation is required before deletion.");
    const order = await this.findCustomerOrder(customerId, orderNumber, id);
    if (["completed", "cancelled"].includes(order.status)) throw new BadRequestException("Closed orders cannot be deleted from AI.");
    return this.mcpOrdersService.deleteOrder({ id: order.id });
  }

  private async findCustomerOrder(customerId: string, orderNumber?: string, id?: string) {
    if (!customerId) throw new BadRequestException("Customer context is required.");
    const safeId = this.isObjectId(id) ? id : undefined;
    const safeOrderNumber = this.stringArg(orderNumber);
    if (safeId) {
      const byId = await this.prisma.order.findFirst({ where: { id: safeId, customerId, status: { notIn: ["completed", "cancelled"] } } });
      if (byId) return byId;
    }
    if (safeOrderNumber) {
      const byOrderNumber = await this.prisma.order.findFirst({ where: { orderNumber: safeOrderNumber, customerId, status: { notIn: ["completed", "cancelled"] } } });
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
