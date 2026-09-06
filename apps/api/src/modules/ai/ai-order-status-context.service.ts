import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type OrderDetails = Exclude<NonNullable<AiContext>["activeOrderState"], undefined>;

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

const FLAVORS = [
  "Bacon with Cheese",
  "Pork Regular",
  "Pork Regular with Egg",
  "Pork Asado",
  "Ham & Cheese",
  "Chicken",
  "Chicken with Egg",
  "Ube Empanada",
  "Mango",
  "Choco",
  "Beef",
  "Beef with Egg"
];

const PRICES: Record<string, number> = {
  "bacon with cheese": 35,
  "pork regular": 20,
  "pork regular with egg": 25,
  "pork asado": 30,
  "ham & cheese": 25,
  "ham and cheese": 25,
  "ham cheese": 25,
  "chicken": 20,
  "chicken with egg": 25,
  "ube empanada": 25,
  "ube": 25,
  "mango": 25,
  "choco": 30,
  "chocolate": 30,
  "beef": 35,
  "beef with egg": 40
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
      const usableState = isConfirmation ? (this.reconstructActiveOrderState(context) ?? context?.activeOrderState) : context?.activeOrderState;

      if (isConfirmation && usableState && this.hasCompleteOrderState(usableState)) {
        this.logger.log("Order confirmation reused reconstructed active order state without Qwen interpretation");
        return {
          intent: "order_confirmation",
          confidence: 1,
          details: { ...usableState, confirmed: true },
          suggestedReply: "",
          source: "ollama"
        };
      }

      if (!isStatusQuestion && !orderNumber) return original(message, { ...context, activeOrderState: usableState });

      const enrichedContext = await this.enrichOrderStatusContext({ ...context, activeOrderState: usableState }, orderNumber);
      if (!enrichedContext.orderStatus) {
        return {
          intent: "inquiry",
          confidence: 1,
          details: usableState ?? { flavors: [], missingFields: [], confirmed: false },
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

  private reconstructActiveOrderState(context?: AiContext): OrderDetails | undefined {
    const base = context?.activeOrderState;
    const messages = (context?.recentMessages ?? [])
      .map((value) => value.trim())
      .filter((value) => /^Customer:/i.test(value));
    if (!messages.length) return base;

    const reconstructed = {
      ...(base ?? {}),
      flavors: Array.isArray(base?.flavors) ? base.flavors.map((item) => ({ ...item })) : []
    } as OrderDetails & Record<string, unknown>;

    const flavorMap = new Map<string, { name: string; quantity: number; unitPrice: number; subtotal: number }>();
    for (const item of reconstructed.flavors as Array<Record<string, unknown>>) {
      const name = String(item.name ?? "").trim();
      if (!name) continue;
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unitPrice ?? PRICES[name.toLowerCase()] ?? 0);
      flavorMap.set(name.toLowerCase(), { name, quantity, unitPrice, subtotal: quantity * unitPrice });
    }

    for (const entry of messages) {
      const text = entry.replace(/^Customer:\s*/i, "");
      const lower = text.toLowerCase();

      if (/\bgcash\b/i.test(lower)) reconstructed.paymentMethod = "gcash";
      else if (/\b(?:cash|cod|cash on delivery)\b/i.test(lower)) reconstructed.paymentMethod = "cod";

      if (/\bmaxim(?: delivery)?\b/i.test(lower)) reconstructed.deliveryMethod = "maxim";
      else if (/\bpick\s*up\b|\bpickup\b/i.test(lower)) reconstructed.deliveryMethod = "pickup";

      const address = text.match(/(?:^|\n|[-•])\s*Address\s*:\s*(.+?)(?=\s+(?:Landmark|Contact\s*#|Delivery date|Preferred time)\s*:|$)/i);
      if (address?.[1]?.trim()) reconstructed.address = address[1].trim();

      const landmark = text.match(/(?:^|\n|[-•])\s*Landmark\s*:\s*(.+?)(?=\s+(?:Contact\s*#|Delivery date|Preferred time)\s*:|$)/i);
      if (landmark?.[1]?.trim()) reconstructed.landmark = landmark[1].trim();

      const contact = text.match(/(?:^|\n|[-•])\s*Contact\s*#?\s*:\s*([+\d][\d\s-]{8,})/i);
      if (contact?.[1]) reconstructed.contactNumber = contact[1].replace(/\s+/g, "").trim();

      const deliveryDate = text.match(/(?:^|\n|[-•])\s*Delivery date\s*:\s*([^\n]+)/i);
      if (deliveryDate?.[1]?.trim()) reconstructed.deliveryDate = deliveryDate[1].trim();

      for (const flavor of FLAVORS) {
        const escaped = flavor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = text.match(new RegExp(`(?:^|[-•,;\\n]|Flavors?:)\\s*(\\d+)\\s*(?:pcs?|pieces?)\\s+${escaped}(?:\\s*\\(.*?\\))?`, "i"));
        if (!match) continue;
        const quantity = Number(match[1]);
        const key = flavor.toLowerCase();
        const unitPrice = PRICES[key] ?? 0;
        flavorMap.set(key, { name: flavor, quantity, unitPrice, subtotal: quantity * unitPrice });
      }

      const quantityMatch = text.match(/(?:^|\s)(\d+)\s*(?:pcs?|pieces?)\b/i);
      if (quantityMatch) reconstructed.quantity = Number(quantityMatch[1]);
    }

    const flavors = [...flavorMap.values()].filter((item) => item.quantity > 0);
    if (flavors.length) {
      reconstructed.flavors = flavors;
      reconstructed.quantity = flavors.reduce((sum, item) => sum + item.quantity, 0);
      reconstructed.totalAmount = flavors.reduce((sum, item) => sum + item.subtotal, 0);
    }

    reconstructed.missingFields = this.calculateMissingFields(reconstructed);
    this.logger.log(`Reconstructed active Messenger order state: quantity=${reconstructed.quantity ?? 0} flavors=${reconstructed.flavors.length} delivery=${reconstructed.deliveryMethod ?? "none"} payment=${reconstructed.paymentMethod ?? "none"} missing=${JSON.stringify(reconstructed.missingFields)}`);
    return reconstructed;
  }

  private calculateMissingFields(details: OrderDetails) {
    const missing: string[] = [];
    const quantity = Number(details.quantity ?? 0);
    const flavorQuantity = (details.flavors ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (!details.flavors?.length) missing.push("flavors");
    if (!quantity || flavorQuantity !== quantity) missing.push("quantity");
    if (quantity > 0 && quantity < 10) missing.push("minimumOrder");
    if (!details.deliveryMethod) missing.push("deliveryMethod");
    if (!details.paymentMethod) missing.push("paymentMethod");
    if (details.deliveryMethod === "maxim") {
      if (!details.address?.trim()) missing.push("address");
      if (!details.landmark?.trim()) missing.push("landmark");
      if (!details.contactNumber?.trim()) missing.push("contactNumber");
    }
    return [...new Set(missing)];
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

      recentMessages.push(`APPLICATION ORDER STATUS TOOL RESULT: Live MCP order lookup found Order ${order.orderNumber}${customerName ? ` for customer \"${customerName}\"` : ""}. Status=${order.status}; quantity=${order.quantity}; total=₱${order.totalAmount}; deliveryMethod=${order.deliveryMethod}; paymentMethod=${order.paymentMethod}; preferredSchedule=${this.formatDate(order.preferredSchedule)}; deliveryStatus=${order.delivery?.status ?? "none"}; eta=${this.formatDate(order.delivery?.eta)}; rider=${order.delivery?.riderName ?? "none"}; trackingLink=${order.delivery?.trackingLink ?? "none"}. This live tool result is authoritative. Answer the customer's status question from this result, not from conversation history. Do not claim a different status.`);
      this.logger.log(`Order status MCP lookup for AI: ${orderNumber ? `order=${JSON.stringify(orderNumber)}` : `customer=${JSON.stringify(customerName)}`} resolved=${order.orderNumber} status=${order.status}`);
      return { context: { ...context, recentMessages }, orderStatus: order, missingOrderIdMessage: undefined };
    } catch (error) {
      const missingOrderIdMessage = orderNumber
        ? `I couldn't find an order with ID ${orderNumber}. Please check the order ID and send it again.`
        : "I couldn't find an order under your details. Please send your order ID so I can check the status.";
      recentMessages.push(`APPLICATION ORDER STATUS TOOL RESULT: The live MCP order-status lookup could not find or load the requested order${orderNumber ? ` (${orderNumber})` : ""}. Ask the customer for their order ID and do not invent a status.`);
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
    const explicit = message.match(/\b(?:order\s*(?:id|number|no)\s*[:#-]?|order\s*#\s*)\s*([A-Za-z0-9-]{3,64})\b/i);
    return explicit?.[1]?.trim();
  }

  private extractFollowUpOrderNumber(message: string, context?: AiContext) {
    const normalized = message.trim();
    if (!/^[A-Za-z0-9-]{3,64}$/.test(normalized)) return undefined;
    const recent = (context?.recentMessages ?? []).slice(-3).join(" ");
    return /order\s*(?:id|number|#)|send.*order/i.test(recent) ? normalized : undefined;
  }

  private isOrderStatusQuestion(message: string) {
    return /\b(order\s*status|status\s*(?:sa|of|for|my)?\s*order|where(?:'s| is)\s+my\s+order|asa(?:n)?\s+(?:na|ang)\s+(?:akong|my)\s+order|naa na ba\s+(?:ang|akong)\s+order|naabot na ba\s+akong\s+order|has my order been placed|did you place my order|have you placed my order|was my order placed|is my order placed)\b/i.test(message);
  }

  private isConfirmationMessage(message: string) {
    const lower = message.trim().toLowerCase();
    return /^(yes|yeah|yep|correct|confirmed|confirm|go ahead|proceed|okay proceed|okay do it|do it|place my order|place the order|place that order|order it|order that|that's correct|that is correct|everything is correct|all are correct)$/.test(lower);
  }

  private hasCompleteOrderState(details: OrderDetails) {
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
}
