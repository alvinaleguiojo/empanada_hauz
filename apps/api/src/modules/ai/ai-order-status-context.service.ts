import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];

type OrderStatusResult = {
  id?: string;
  orderNumber: string;
  status: string;
  quantity: number;
  totalAmount: number;
  deliveryMethod: string;
  paymentMethod: string;
  preferredSchedule?: string | Date | null;
  delivery?: {
    status?: string | null;
    scheduledAt?: string | Date | null;
    eta?: string | Date | null;
    trackingLink?: string | null;
    riderName?: string | null;
  } | null;
};

@Injectable()
export class AiOrderStatusContextService implements OnModuleInit {
  private readonly logger = new Logger(AiOrderStatusContextService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly mcpOrders: McpOrdersService
  ) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);
    this.aiService.classifyAndExtract = async (message, context) => {
      if (!this.isOrderStatusQuestion(message)) return original(message, context);

      const enrichedContext = await this.enrichOrderStatusContext(context);
      const result = await original(message, enrichedContext.context);

      if (enrichedContext.orderStatus) {
        const statusLine = this.formatOrderStatusLine(enrichedContext.orderStatus);
        const reply = result.suggestedReply?.trim() ?? "";
        result.suggestedReply = reply ? `${reply}\n${statusLine}` : statusLine;
      }

      return result;
    };
  }

  private async enrichOrderStatusContext(context?: AiContext) {
    const recentMessages = [...(context?.recentMessages ?? [])];
    const customerName = context?.customerName?.trim();

    if (!customerName) {
      recentMessages.push(
        "APPLICATION ORDER STATUS TOOL RESULT: No customer identity is available for a live order lookup. Do not claim a current order status."
      );
      return { context: { ...context, recentMessages }, orderStatus: undefined };
    }

    try {
      const listResult = await this.mcpOrders.listOrders({ customerName, limit: 1 });
      const latest = listResult.orders?.[0] as OrderStatusResult | undefined;

      if (!latest?.id) {
        recentMessages.push(
          `APPLICATION ORDER STATUS TOOL RESULT: No order was found for customer "${customerName}". Do not invent an order number or status.`
        );
        return { context: { ...context, recentMessages }, orderStatus: undefined };
      }

      const order = await this.mcpOrders.getOrder({ id: latest.id }) as OrderStatusResult;
      recentMessages.push(
        `APPLICATION ORDER STATUS TOOL RESULT: Live MCP order lookup found Order ${order.orderNumber} for customer "${customerName}". Status=${order.status}; quantity=${order.quantity}; total=₱${order.totalAmount}; deliveryMethod=${order.deliveryMethod}; paymentMethod=${order.paymentMethod}; preferredSchedule=${this.formatDate(order.preferredSchedule)}; deliveryStatus=${order.delivery?.status ?? "none"}; eta=${this.formatDate(order.delivery?.eta)}; rider=${order.delivery?.riderName ?? "none"}; trackingLink=${order.delivery?.trackingLink ?? "none"}. This live tool result is authoritative. Answer the customer's status question from this result, not from conversation history. Do not claim a different status.`
      );
      this.logger.log(`Order status MCP lookup for AI: customer=${JSON.stringify(customerName)} order=${order.orderNumber} status=${order.status}`);
      return { context: { ...context, recentMessages }, orderStatus: order };
    } catch (error) {
      recentMessages.push(
        "APPLICATION ORDER STATUS TOOL RESULT: The live MCP order-status lookup failed. Do not invent the order status; explain that the status could not be checked right now."
      );
      this.logger.warn(`Order status MCP lookup failed for AI: ${error instanceof Error ? error.message : String(error)}`);
      return { context: { ...context, recentMessages }, orderStatus: undefined };
    }
  }

  private formatOrderStatusLine(order: OrderStatusResult) {
    const parts = [`Order ${order.orderNumber} status: ${order.status}.`];
    if (order.delivery?.status) parts.push(`Delivery status: ${order.delivery.status}.`);
    if (order.delivery?.eta) parts.push(`ETA: ${this.formatDate(order.delivery.eta)}.`);
    if (order.delivery?.riderName) parts.push(`Rider: ${order.delivery.riderName}.`);
    if (order.delivery?.trackingLink) parts.push(`Track here: ${order.delivery.trackingLink}`);
    return parts.join(" ");
  }

  private formatDate(value?: string | Date | null) {
    if (!value) return "none";
    return value instanceof Date ? value.toISOString() : String(value);
  }

  private isOrderStatusQuestion(message: string) {
    return /\b(order\s*status|status\s*(?:sa|of|for|my)?\s*order|where(?:'s| is)\s+my\s+order|asa(?:n)?\s+(?:na|ang)\s+(?:akong|my)\s+order|naa na ba\s+(?:ang|akong)\s+order|naabot na ba\s+akong\s+order|has my order been placed|did you place my order|have you placed my order|was my order placed|is my order placed)\b/i.test(message);
  }
}
