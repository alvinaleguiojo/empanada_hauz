import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { OrdersService } from "../orders/orders.service";

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
    private readonly ordersService: OrdersService
  ) {}

  async execute(tool: AiApplicationToolName, args: Record<string, unknown>) {
    switch (tool) {
      case "get_order_summary":
        return this.getCustomerOrderSummary(this.stringArg(args.customerId), this.stringArg(args.orderNumber));
      case "check_order_status":
        return this.getCustomerOrderStatus(this.stringArg(args.customerId), this.stringArg(args.orderNumber));
      case "create_order":
        return this.mcpOrdersService.createOrder(args as Parameters<McpOrdersService["createOrder"]>[0]);
      case "update_order":
        return this.updateCustomerOrder(this.stringArg(args.customerId), args);
      case "cancel_order":
        return this.cancelCustomerOrder(this.stringArg(args.customerId), this.stringArg(args.orderNumber));
      case "delete_order":
        return this.deleteCustomerOrder(this.stringArg(args.customerId), this.stringArg(args.orderNumber));
    }
  }

  private async getCustomerOrderSummary(customerId: string, orderNumber?: string) {
    const order = await this.findCustomerOrder(customerId, orderNumber);
    return this.mcpOrdersService.getOrder({ id: order.id });
  }

  private async getCustomerOrderStatus(customerId: string, orderNumber?: string) {
    const order = await this.findCustomerOrder(customerId, orderNumber);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      quantity: order.quantity,
      deliveryMethod: order.deliveryMethod,
      preferredSchedule: order.preferredSchedule,
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee
    };
  }

  private async updateCustomerOrder(customerId: string, args: Record<string, unknown>) {
    const order = await this.findCustomerOrder(customerId, this.stringArg(args.orderNumber), this.stringArg(args.id));
    const payload = { ...args, id: order.id } as Parameters<McpOrdersService["updateOrder"]>[0];
    delete (payload as Record<string, unknown>).customerId;
    return this.mcpOrdersService.updateOrder(payload);
  }

  private async cancelCustomerOrder(customerId: string, orderNumber?: string) {
    const order = await this.findCustomerOrder(customerId, orderNumber);
    return this.mcpOrdersService.updateOrder({ id: order.id, status: "cancelled" });
  }

  private async deleteCustomerOrder(customerId: string, orderNumber?: string) {
    const order = await this.findCustomerOrder(customerId, orderNumber);
    if (["completed", "cancelled"].includes(order.status)) {
      throw new BadRequestException("Closed orders cannot be deleted from Messenger.");
    }
    return this.mcpOrdersService.deleteOrder({ id: order.id });
  }

  private async findCustomerOrder(customerId: string, orderNumber?: string, id?: string) {
    if (!customerId) throw new BadRequestException("Customer context is required.");
    const order = await this.prisma.order.findFirst({
      where: {
        ...(id ? { id } : {}),
        ...(orderNumber ? { orderNumber } : {}),
        customerId,
        status: { notIn: ["completed", "cancelled"] }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    if (!order) throw new NotFoundException("No active order was found for this customer.");
    return order;
  }

  private stringArg(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }
}
