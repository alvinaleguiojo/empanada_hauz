import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
    const customerName = this.stringArg(args.customerName);
    const quantity = Number(args.quantity);
    const items = this.normalizeItems(args.items);
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
    if (!["pickup", "maxim"].includes(this.stringArg(args.deliveryMethod))) throw new BadRequestException("A valid delivery method is required.");
    if (!["cod", "gcash"].includes(this.stringArg(args.paymentMethod))) throw new BadRequestException("A valid payment method is required.");
    if (this.stringArg(args.deliveryMethod) === "maxim" && (!this.stringArg(args.address) || !this.stringArg(args.location) || !this.stringArg(args.phoneNumber))) throw new BadRequestException("Maxim delivery requires address, landmark/location, and contact number.");

    const payload = { ...args, customerId: undefined, items: productItems, quantity: Math.trunc(quantity) };
    delete (payload as Record<string, unknown>).customerId;
    delete (payload as Record<string, unknown>).confirmed;
    return this.mcpOrdersService.createOrder(payload as Parameters<McpOrdersService["createOrder"]>[0]);
  }

  private async updateCustomerOrder(customerId: string, args: Record<string, unknown>) {
    const order = await this.findCustomerOrder(customerId, this.stringArg(args.orderNumber), this.stringArg(args.id));
    const payload = { ...args, id: order.id } as Parameters<McpOrdersService["updateOrder"]>[0];
    delete (payload as Record<string, unknown>).customerId;
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
    const order = await this.prisma.order.findFirst({ where: { ...(id ? { id } : {}), ...(orderNumber ? { orderNumber } : {}), customerId, status: { notIn: ["completed", "cancelled"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (!order) throw new NotFoundException("No active order was found for this customer.");
    return order;
  }

  private normalizeItems(value: unknown) {
    if (!Array.isArray(value)) return [] as Array<{ name: string; quantity: number }>;
    return value.map((item) => ({ name: typeof item?.name === "string" ? item.name.trim() : "", quantity: Math.trunc(Number(item?.quantity)) })).filter((item) => item.name && Number.isFinite(item.quantity) && item.quantity > 0);
  }

  private stringArg(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : ""; }
}
