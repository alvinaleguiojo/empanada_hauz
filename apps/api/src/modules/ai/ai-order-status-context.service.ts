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
      const isStatusQuestion = this.isOrderStatusQuestion(message);
      const isConfirmation = this.isConfirmationMessage(message);
      const orderNumber = this.extractOrderNumber(message) ?? this.extractFollowUpOrderNumber(message, context);

      if (isConfirmation && context?.activeOrderState && this.hasCompleteOrderState(context.activeOrderState)) {
        this.logger.log("Order confirmation bypassed Qwen interpretation; reusing saved active order state");
        return {
          intent: "order_confirmation",
          confidence: 1,
          details: { ...context.activeOrderState, confirmed: true },
          suggestedReply: "",
          source: "ollama"
        };
      }

      if (!isStatusQuestion && !orderNumber) return original(message, context);

      const enrichedContext = await this.enrichOrderStatusContext(context, orderNumber);
      if (!enrichedContext.orderStatus) {
        return {
          intent: "inquiry",
          confidence: 1,
          details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
          suggestedReply: enrichedContext.missingOrderIdMessage ?? "I couldn't find your order. Please send your order ID so I can check the status.",
          source: "ollama"
        };
      }

      const result = await original(message, enrichedContext.context);
      const statusLine = this.formatOrderStatusLine(enrichedContext.orderStatus);
      const reply = result.suggestedReply?.trim() ?? "";
      result.suggestedReply = reply ? `${reply}\n${statusLine}` : statusLine;
      return result;
    };
  }

  private hasCompleteOrderState(details: NonNullable<AiContext>["activeOrderState"]) {
    if (!details) return false;
    const quantity = Number(details.quantity ?? 0);
    const flavorQuantity = (details.flavors ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const deliveryComplete = details.deliveryMethod === "pickup"
      || (details.deliveryMethod === "maxim" && Boolean(details.address?.trim() && details.landmark?.trim() && details.contactNumber?.trim()));
    return details.flavors.length > 0
      && quantity >= 10
      && flavorQuantity === quantity
      && Boolean(details.deliveryMethod)
      && Boolean(details.paymentMethod)
      && deliveryComplete
      && details.missingFields.length === 0;
  }

  private isConfirmationMessage(message: string) {
    const lower = message.trim().toLowerCase();
    return /^(yes|yeah|yep|correct|confirmed|confirm|go ahead|proceed|okay proceed|okay do it|do it|place my order|place the order|place that order|order it|order that|that's correct|that is correct|everything is correct|all are correct)$/.test(lower);
  }

  private async enrichOrderStatusContext(context?: AiContext, orderNumber?: string) {
    const recentMessages = [...(context?.recentMessages ?? [])];
    const customerName = context?.customerName?.trim();

    try {
      let order: OrderStatusResult | undefined;

      if (orderNumber) {
        order = await this.mcpOrders.getOrder({ orderNumber }) as OrderStatusResult;
      } else if (customerName) {
        const listResult = await this.mcpOrders.listOrders({ customerName, limit: 1 });
        const latest = listResult.orders?.[0] as OrderStatusResult | undefined;
        if (latest?.id) order = await this.mcpOrders.getOrder({ id: latest.id }) as OrderStatusResult;
      }

      if (!order?.id && !order?.orderNumber) {
        const missingOrderIdMessage = "I couldn't find an order under your details. Please send your order ID so I can check the status.";
        recentMessages.push(`APPLICATION ORDER STATUS TOOL RESULT: No order was found${orderNumber ? ` for order ID \"${orderNumber}\"` : customerName ? ` for customer \"${customerName}\"` : ""}. Ask the customer for their order ID. Do not invent an order number or status.`);
        return { context: { ...context, recentMessages }, orderStatus: undefined, missingOrderIdMessage };
      }

      recentMessages.push(
        `APPLICATION ORDER STATUS TOOL RESULT: Live MCP order lookup found Order ${order.orderNumber}${customerName ? ` for customer \"${customerName}\"` : ""}. Status=${order.status}; quantity=${order.quantity}; total=₱${order.totalAmount}; deliveryMethod=${order.deliveryMethod}; paymentMethod=${order.paymentMethod}; preferredSchedule=${this.formatDate(order.preferredSchedule)}; deliveryStatus=${order.delivery?.status ?? "none"}; eta=${this.formatDate(order.delivery?.eta)}; rider=${order.delivery?.riderName ?? "none"}; trackingLink=${order.delivery?.trackingLink ?? "none"}. This live tool result is authoritative. Answer the customer's status question from this result, not from conversation history. Do not claim a different status.`
      );
      this.logger.log(`Order status MCP lookup for AI: ${orderNumber ? `order=${JSON.stringify(orderNumber)}` : `customer=${JSON.stringify(customerName)}`} resolved=${order.orderNumber} status=${order.status}`);
      return { context: { ...context, recentMessages }, orderStatus: order, missingOrderIdMessage: undefined };
    } catch (error) {
      const missingOrderIdMessage = orderNumber
        ? `I couldn't find an order with ID ${orderNumber}. Please check the order ID and send it again.`
        : "I couldn't find an order under your details. Please send your order ID so I can check the status.";
      recentMessages.push(
        `APPLICATION ORDER STATUS TOOL RESULT: The live MCP order-status lookup could not find or load the requested order${orderNumber ? ` (${orderNumber})` : ""}. Ask the customer for their order ID and do not invent a status.`
      );
      this.logger.warn(`Order status MCP lookup failed for AI: ${error instanceof Error ? error.message : String(error)}`);
      return { context: { ...context, recentMessages }, orderStatus: undefined, missingOrderIdMessage };
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

  private extractOrderNumber(message: string) {
    const match = message.match(/\b(?:order\s*(?:id|number|no)?|order\s*#)\s*[:#-]?\s*([A-Za-z0-9-]+)\b/i);
    return match?.[1]?.trim();
  }

  private extractFollowUpOrderNumber(message: string, context?: AiContext) {
    const normalized = message.trim();
    if (!/^[A-Za-z0-9-]{3,32}$/.test(normalized)) return undefined;
    const recent = (context?.recentMessages ?? []).slice(-3).join(" ");
    return /order\s*(?:id|number|#)|send.*order/i.test(recent) ? normalized : undefined;
  }

  private isOrderStatusQuestion(message: string) {
    return /\b(order\s*status|status\s*(?:sa|of|for|my)?\s*order|where(?:'s| is)\s+my\s+order|asa(?:n)?\s+(?:na|ang)\s+(?:akong|my)\s+order|naa na ba\s+(?:ang|akong)\s+order|naabot na ba\s+akong\s+order|has my order been placed|did you place my order|have you placed my order|was my order placed|is my order placed)\b/i.test(message);
  }
}
