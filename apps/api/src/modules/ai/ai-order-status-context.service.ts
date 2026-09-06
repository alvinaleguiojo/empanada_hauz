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
  location?: string | null;
  address?: string | null;
  preferredSchedule?: string | Date | null;
  items?: Array<{ name: string; quantity: number; price?: number; subtotal?: number }> | null;
  customer?: { name?: string | null; phoneNumber?: string | null } | null;
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
  chicken: 20,
  "chicken with egg": 25,
  "ube empanada": 25,
  ube: 25,
  mango: 25,
  choco: 30,
  chocolate: 30,
  beef: 35,
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
      const routingChoice = this.extractExistingOrderRoutingChoice(message, context);
      if (routingChoice === "new") {
        this.logger.log("Customer selected NEW order in status context; clearing existing order state");
        return original(message, { ...context, activeOrderState: undefined });
      }

      const isUpdate = this.isExplicitOrderUpdate(message);
      const isAvailability = !isUpdate && this.isAvailabilityQuestion(message);
      const isStatusQuestion = !isUpdate && !isAvailability && this.isOrderStatusQuestion(message);
      const isSummaryQuestion = !isUpdate && !isAvailability && this.isOrderSummaryQuestion(message);
      const isConfirmation = !isUpdate && !isAvailability && !isSummaryQuestion && this.isConfirmationMessage(message);
      const orderNumber = this.extractOrderNumber(message) ?? this.extractFollowUpOrderNumber(message, context);
      const usableState = isConfirmation ? (this.reconstructActiveOrderState(context) ?? context?.activeOrderState) : context?.activeOrderState;

      if (isAvailability) {
        const result = await original(message, { ...context, activeOrderState: usableState });
        const today = new Date();
        const isSunday = today.getDay() === 0;
        result.intent = "inquiry";
        result.confidence = 1;
        result.suggestedReply = isSunday
          ? "Sorry, we're closed today (Sunday). We'll be back tomorrow. 😊"
          : "Yes, we're available and accepting orders. What would you like to order? 😊";
        return result;
      }

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

      if (isUpdate) {
        const result = await original(message, { ...context, activeOrderState: usableState });
        const updated = await this.applyExplicitOrderUpdate(result, message, context, orderNumber);
        if (updated) result.suggestedReply = "Your order has been updated successfully.";
        return result;
      }

      if (isSummaryQuestion) {
        const enrichedContext = await this.enrichOrderStatusContext({ ...context, activeOrderState: usableState }, orderNumber);
        if (!enrichedContext.orderStatus) {
          return {
            intent: "inquiry",
            confidence: 1,
            details: usableState ?? { flavors: [], missingFields: [], confirmed: false },
            suggestedReply: enrichedContext.missingOrderIdMessage ?? "I couldn't find your order. Please send your order ID so I can generate the summary.",
            source: "ollama"
          };
        }
        return {
          intent: "inquiry",
          confidence: 1,
          details: usableState ?? { flavors: [], missingFields: [], confirmed: false },
          suggestedReply: this.formatOrderSummary(enrichedContext.orderStatus),
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

  private extractExistingOrderRoutingChoice(message: string, context?: AiContext) {
    const normalized = message.trim().toLowerCase();
    if (!/^(new|change|edit|update|modify|existing|old|same|yes|no)$/i.test(normalized)) return undefined;

    const recent = (context?.recentMessages ?? []).slice(-4).map((entry) => String(entry).trim()).join("\n");
    if (!/(?:existing order|place a new order|change your existing order)/i.test(recent)) return undefined;

    if (/^(new|yes)$/i.test(normalized)) return "new" as const;
    return "change" as const;
  }

  private async applyExplicitOrderUpdate(
    result: Awaited<ReturnType<AiService["classifyAndExtract"]>>,
    message: string,
    context?: AiContext,
    orderNumber?: string
  ) {
    const customerName = context?.customerName?.trim();
    let order: OrderStatusResult | undefined;

    try {
      if (orderNumber) {
        order = await this.mcpOrders.getOrder({ orderNumber }) as OrderStatusResult;
        if (customerName && order.customer?.name && order.customer.name.localeCompare(customerName, undefined, { sensitivity: "accent" }) !== 0) {
          this.logger.warn(`Explicit order update refused due to customer mismatch: order=${order.orderNumber}`);
          return undefined;
        }
      } else if (customerName) {
        const listResult = await this.mcpOrders.listOrders({ customerName, limit: 100 });
        const latest = listResult.orders?.find((candidate) => !["completed", "cancelled"].includes(String(candidate.status))) as OrderStatusResult | undefined;
        if (latest?.id) order = await this.mcpOrders.getOrder({ id: latest.id }) as OrderStatusResult;
      }

      if (!order?.orderNumber || ["completed", "cancelled"].includes(order.status)) {
        this.logger.warn(`Explicit order update skipped: ${order ? `order=${order.orderNumber} status=${order.status}` : "no matching editable order"}`);
        return undefined;
      }

      const details = result.details;
      const update: Parameters<McpOrdersService["updateOrder"]>[0] = { orderNumber: order.orderNumber };
      const explicitItems = this.extractExplicitOrderItems(message);
      const flavors = explicitItems.length ? explicitItems : (details.flavors ?? []);
      const isAddRequest = this.isAddItemsRequest(message);
      const isRemoveRequest = this.isRemoveItemsRequest(message);

      if (flavors.length) {
        const finalItems = isAddRequest
          ? this.mergeOrderItems(order.items ?? [], flavors, 1)
          : isRemoveRequest
            ? this.mergeOrderItems(order.items ?? [], flavors, -1)
            : flavors.map((item) => ({ name: item.name, quantity: Number(item.quantity), price: item.unitPrice, subtotal: item.subtotal }));
        update.items = finalItems;
        update.quantity = finalItems.reduce((sum, item) => sum + Number(item.quantity), 0);
      } else if (details.quantity !== undefined) {
        update.quantity = Number(details.quantity);
      }

      const lower = message.toLowerCase();
      if (details.deliveryMethod && /\b(?:maxim(?:\s+delivery)?|pickup|pick\s+up)\b/i.test(lower)) update.deliveryMethod = details.deliveryMethod;
      if (details.paymentMethod && /\b(?:gcash|cod|cash|cash\s+on\s+delivery)\b/i.test(lower)) update.paymentMethod = details.paymentMethod;
      if (details.address !== undefined && /\baddress\s*[:]/i.test(message)) update.address = details.address;
      if (details.location !== undefined && /\blandmark\s*[:]/i.test(message)) update.location = details.location;
      if (details.contactNumber !== undefined && /\bcontact(?:\s*#|\s*number)?\s*[:]/i.test(message)) update.phoneNumber = details.contactNumber;
      if (details.deliveryDate && details.preferredTime && !this.looksLikeDateOnly(details.preferredTime)) update.preferredSchedule = this.toManilaIso(details.deliveryDate, details.preferredTime);

      const hasChanges = Object.keys(update).some((key) => key !== "orderNumber");
      if (!hasChanges) return undefined;

      return await this.mcpOrders.updateOrder(update) as OrderStatusResult;
    } catch (error) {
      this.logger.warn(`Explicit order update failed via MCP: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private mergeOrderItems(existing: NonNullable<OrderStatusResult["items"]>, changes: Array<{ name: string; quantity: number; unitPrice?: number; subtotal?: number }>, direction: 1 | -1) {
    const map = new Map<string, { name: string; quantity: number; price: number; subtotal: number }>();
    for (const item of existing) {
      const name = String(item.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const price = Number(item.price ?? PRICES[key] ?? 0);
      const quantity = Math.max(0, Number(item.quantity ?? 0));
      map.set(key, { name, quantity, price, subtotal: quantity * price });
    }
    for (const change of changes) {
      const key = change.name.toLowerCase();
      const current = map.get(key);
      const price = current?.price ?? Number(change.unitPrice ?? PRICES[key] ?? 0);
      const nextQuantity = Math.max(0, Number(current?.quantity ?? 0) + direction * Number(change.quantity ?? 0));
      if (nextQuantity <= 0) map.delete(key);
      else map.set(key, { name: current?.name ?? change.name, quantity: nextQuantity, price, subtotal: nextQuantity * price });
    }
    return [...map.values()].map((item) => ({ name: item.name, quantity: item.quantity, price: item.price, subtotal: item.subtotal }));
  }

  private isAddItemsRequest(message: string) { return /\b(?:add|plus|dugang)\b/i.test(message); }
  private isRemoveItemsRequest(message: string) { return /\b(?:remove|take\s+out|kuhaon|minus)\b/i.test(message); }

  private extractExplicitOrderItems(message: string) {
    const sortedFlavors = [...FLAVORS].sort((a, b) => b.length - a.length);
    const items = new Map<string, { name: string; quantity: number; unitPrice: number; subtotal: number }>();
    for (const flavor of sortedFlavors) {
      const escaped = flavor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const beforeFlavor = message.match(new RegExp(`(?:^|\\bto\\b|[-•,;\\n])\\s*(\\d+)\\s*(?:pcs?|pieces?)\\s+${escaped}\\b`, "i"));
      const afterFlavor = message.match(new RegExp(`\\b${escaped}\\b\\s*(?:x|[-:]|for)?\\s*(\\d+)\\s*(?:pcs?|pieces?)\\b`, "i"));
      const match = beforeFlavor ?? afterFlavor;
      if (!match) continue;
      const quantity = Number(match[1]);
      if (!Number.isFinite(quantity) || quantity < 1) continue;
      const key = flavor.toLowerCase();
      const unitPrice = PRICES[key] ?? 0;
      items.set(key, { name: flavor, quantity, unitPrice, subtotal: quantity * unitPrice });
    }
    return [...items.values()];
  }

  private reconstructActiveOrderState(context?: AiContext): OrderDetails | undefined {
    const base = context?.activeOrderState;
    const messages = (context?.recentMessages ?? []).map((value) => value.trim()).filter((value) => /^Customer:/i.test(value));
    if (!messages.length) return base;
    const reconstructed = { ...(base ?? {}), flavors: Array.isArray(base?.flavors) ? base.flavors.map((item) => ({ ...item })) : [] } as OrderDetails & Record<string, unknown>;
    const flavorMap = new Map<string, { name: string; quantity: number; unitPrice: number; subtotal: number }>();
    for (const item of reconstructed.flavors as Array<Record<string, unknown>>) {
      const name = String(item.name ?? "").trim(); if (!name) continue;
      const quantity = Number(item.quantity ?? 0); const unitPrice = Number(item.unitPrice ?? PRICES[name.toLowerCase()] ?? 0);
      flavorMap.set(name.toLowerCase(), { name, quantity, unitPrice, subtotal: quantity * unitPrice });
    }
    for (const entry of messages) {
      const text = entry.replace(/^Customer:\s*/i, ""); const lower = text.toLowerCase();
      if (/\bgcash\b/i.test(lower)) reconstructed.paymentMethod = "gcash";
      else if (/\b(?:cash|cod|cash on delivery)\b/i.test(lower)) reconstructed.paymentMethod = "cod";
      if (/\bmaxim(?: delivery)?\b/i.test(lower)) reconstructed.deliveryMethod = "maxim";
      else if (/\bpick\s*up\b|\bpickup\b/i.test(lower)) reconstructed.deliveryMethod = "pickup";
      const address = text.match(/(?:^|\n|[-•])\s*Address\s*:\s*(.+?)(?=\s+(?:Landmark|Contact\s*#|Delivery date|Preferred time)\s*:|$)/i); if (address?.[1]?.trim()) reconstructed.address = address[1].trim();
      const landmark = text.match(/(?:^|\n|[-•])\s*Landmark\s*:\s*(.+?)(?=\s+(?:Contact\s*#|Delivery date|Preferred time)\s*:|$)/i); if (landmark?.[1]?.trim()) reconstructed.landmark = landmark[1].trim();
      const contact = text.match(/(?:^|\n|[-•])\s*Contact\s*#?\s*:\s*([+\d][\d\s-]{8,})/i); if (contact?.[1]) reconstructed.contactNumber = contact[1].replace(/\s+/g, "").trim();
      const deliveryDate = text.match(/(?:^|\n|[-•])\s*Delivery date\s*:\s*([^\n]+)/i); if (deliveryDate?.[1]?.trim()) reconstructed.deliveryDate = deliveryDate[1].trim();
      for (const flavor of FLAVORS) {
        const escaped = flavor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = text.match(new RegExp(`(?:^|[-•,;\\n]|Flavors?:)\\s*(\\d+)\\s*(?:pcs?|pieces?)\\s+${escaped}(?:\\s*\\(.*?\\))?`, "i"));
        if (!match) continue;
        const quantity = Number(match[1]); const key = flavor.toLowerCase(); const unitPrice = PRICES[key] ?? 0;
        flavorMap.set(key, { name: flavor, quantity, unitPrice, subtotal: quantity * unitPrice });
      }
      const quantityMatch = text.match(/(?:^|\s)(\d+)\s*(?:pcs?|pieces?)\b/i); if (quantityMatch) reconstructed.quantity = Number(quantityMatch[1]);
    }
    const flavors = [...flavorMap.values()].filter((item) => item.quantity > 0);
    if (flavors.length) {
      reconstructed.flavors = flavors;
      reconstructed.quantity = flavors.reduce((sum, item) => sum + item.quantity, 0);
      reconstructed.totalAmount = flavors.reduce((sum, item) => sum + item.subtotal, 0);
    }
    reconstructed.missingFields = this.calculateMissingFields(reconstructed);
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
        if (customerName && order.customer?.name && order.customer.name.localeCompare(customerName, undefined, { sensitivity: "accent" }) !== 0) order = undefined;
      } else if (customerName) {
        const listResult = await this.mcpOrders.listOrders({ customerName, limit: 100 });
        const latest = listResult.orders?.find((candidate) => !["completed", "cancelled"].includes(String(candidate.status))) as OrderStatusResult | undefined;
        if (latest?.id) order = await this.mcpOrders.getOrder({ id: latest.id }) as OrderStatusResult;
      }
      if (!order?.id && !order?.orderNumber) {
        const missingOrderIdMessage = "I couldn't find an order under your details. Please send your order ID so I can check the status.";
        recentMessages.push(`APPLICATION ORDER STATUS TOOL RESULT: No order was found${orderNumber ? ` for order ID \"${orderNumber}\"` : customerName ? ` for customer \"${customerName}\"` : ""}. Ask the customer for an order ID. Do not invent an order number or status.`);
        return { context: { ...context, recentMessages }, orderStatus: undefined, missingOrderIdMessage };
      }
      recentMessages.push(`APPLICATION ORDER STATUS TOOL RESULT: Live MCP order lookup found Order ${order.orderNumber}${customerName ? ` for customer \"${customerName}\"` : ""}. Status=${order.status}; quantity=${order.quantity}; total=₱${order.totalAmount}; deliveryMethod=${order.deliveryMethod}; paymentMethod=${order.paymentMethod}; preferredSchedule=${this.formatDate(order.preferredSchedule)}; deliveryStatus=${order.delivery?.status ?? "none"}; eta=${this.formatDate(order.delivery?.eta)}; rider=${order.delivery?.riderName ?? "none"}; trackingLink=${order.delivery?.trackingLink ?? "none"}. This live tool result is authoritative. Answer the customer's status question from this result, not from conversation history. Do not claim a different status.`);
      return { context: { ...context, recentMessages }, orderStatus: order, missingOrderIdMessage: undefined };
    } catch (error) {
      const missingOrderIdMessage = orderNumber ? `I couldn't find an order with ID ${orderNumber}. Please check the order ID and send it again.` : "I couldn't find an order under your details. Please send your order ID so I can check the status.";
      recentMessages.push(`APPLICATION ORDER STATUS TOOL RESULT: The live MCP order-status lookup could not find or load the requested order${orderNumber ? ` (${orderNumber})` : ""}. Ask the customer for their order ID and do not invent a status.`);
      this.logger.warn(`Order status MCP lookup failed for AI: ${error instanceof Error ? error.message : String(error)}`);
      return { context: { ...context, recentMessages }, orderStatus: undefined, missingOrderIdMessage };
    }
  }

  private formatOrderSummary(order: OrderStatusResult) {
    const items = (order.items ?? []).filter((item) => item?.name && Number(item.quantity) > 0).map((item) => {
      const quantity = Number(item.quantity); const unitPrice = Number(item.price ?? PRICES[item.name.toLowerCase()] ?? 0); const subtotal = Number(item.subtotal ?? quantity * unitPrice);
      return { quantity, name: String(item.name), unitPrice, subtotal: Number.isFinite(subtotal) ? subtotal : quantity * unitPrice };
    });
    const foodTotal = items.reduce((sum, item) => sum + item.subtotal, 0) || Number(order.totalAmount ?? 0);
    const lines = ["📋 ORDER SUMMARY", "", `Order ID: ${order.orderNumber}`, `Status: ${order.status.charAt(0).toUpperCase()}${order.status.slice(1)}`, "", "ITEMS"];
    if (items.length) for (const item of items) { lines.push(`• ${item.quantity} pcs ${item.name}`); lines.push(`  ₱${item.unitPrice} each × ${item.quantity} = ₱${item.subtotal}`); }
    else lines.push(`• ${order.quantity} pcs`);
    lines.push("", "TOTAL", `Food: ₱${foodTotal.toFixed(0)}`, "", "DELIVERY", `Method: ${order.deliveryMethod === "maxim" ? "Maxim Delivery" : order.deliveryMethod}`);
    if (order.deliveryMethod === "maxim") { if (order.address) lines.push(`Address: ${order.address}`); if (order.location) lines.push(`Landmark: ${order.location}`); if (order.customer?.phoneNumber) lines.push(`Contact #: ${order.customer.phoneNumber}`); }
    lines.push("", "PAYMENT", order.paymentMethod === "gcash" ? "GCash — Alvin Aleguiojo (09453916796)" : "COD");
    const schedule = this.formatSummarySchedule(order.preferredSchedule);
    if (schedule.date || schedule.time) { lines.push("", "SCHEDULE"); if (schedule.date) lines.push(`Delivery date: ${schedule.date}`); if (schedule.time) lines.push(`Preferred time: ${schedule.time}`); }
    lines.push("", "Thank you! 😊");
    return lines.join("\n");
  }

  private formatSummarySchedule(value?: string | Date | null) {
    if (!value) return { date: undefined, time: undefined };
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return { date: String(value), time: undefined };
    const parts = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }).formatToParts(date);
    const dateText = `${parts.find((part) => part.type === "month")?.value} ${parts.find((part) => part.type === "day")?.value}, ${parts.find((part) => part.type === "year")?.value}`;
    const timeText = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true }).format(date);
    const hasExplicitTime = !(date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && !String(value).includes("T"));
    return { date: dateText, time: hasExplicitTime ? timeText : undefined };
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
    if (/^(?:new|change|edit|update|modify|existing|old|same|yes|no)$/i.test(normalized)) return undefined;
    const recent = (context?.recentMessages ?? []).slice(-3).join(" ");
    return /order\s*(?:id|number|#)|send.*order/i.test(recent) ? normalized : undefined;
  }

  private isAvailabilityQuestion(message: string) {
    const lower = message.trim().toLowerCase();
    return /\b(?:available|open|accepting\s+orders?|taking\s+orders?)\b/i.test(lower)
      || /\b(?:pwede|puwede)\b.*\b(?:order|mo\s+order|pa\s+order)\b/i.test(lower)
      || /\b(?:order|mo\s+order|mag[-\s]?order)\b.*\b(?:pa|pwede|puwede)\b/i.test(lower)
      || /\b(?:abli|bukas)\b.*\b(?:pa|karon|karun|order)\b/i.test(lower);
  }

  private isOrderStatusQuestion(message: string) {
    return /\b(order\s*status|status\s*(?:sa|of|for|my)?\s*order|where(?:'s| is)\s+my\s+order|asa(?:n)?\s+(?:na|ang)\s+(?:akong|my)\s+order|naa na ba\s+(?:ang|akong)\s+order|naabot na ba\s+akong\s+order|has my order been placed|did you place my order|have you placed my order|was my order placed|is my order placed)\b/i.test(message);
  }

  private isOrderSummaryQuestion(message: string) {
    return /\b(?:send|show|give|provide|what(?:'s| is))\b.*\b(?:summary|order summary|my order|order details)\b/i.test(message)
      || /\b(?:summary|order summary)\b/i.test(message);
  }

  private isExplicitOrderUpdate(message: string) {
    return /\b(?:change|update|modify|edit|replace|switch|correct|correction|add|remove)\b.*\b(?:my|the)\s+order\b/i.test(message)
      || /\b(?:my|the)\s+order\b.*\b(?:change|update|modify|replace|switch|add|remove)\b/i.test(message)
      || /\bchange\s+my\s+order\s+to\b/i.test(message)
      || /\bupdate\s+my\s+order\s+to\b/i.test(message);
  }

  private isConfirmationMessage(message: string) {
    const lower = message.trim().toLowerCase();
    return /^(yes|yeah|yep|correct|confirmed|confirm|go ahead|proceed|okay proceed|do it|place my order|place the order|place that order|order it|order that|that's correct|that is correct|everything is correct|all are correct)$/.test(lower);
  }

  private hasCompleteOrderState(details: OrderDetails) {
    if (!details) return false;
    const quantity = Number(details.quantity ?? 0);
    const flavorQuantity = (details.flavors ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const deliveryComplete = details.deliveryMethod === "pickup" || (details.deliveryMethod === "maxim" && Boolean(details.address?.trim() && details.landmark?.trim() && details.contactNumber?.trim()));
    return details.flavors.length > 0 && quantity >= 10 && flavorQuantity === quantity && Boolean(details.deliveryMethod) && Boolean(details.paymentMethod) && deliveryComplete && details.missingFields.length === 0;
  }

  private toManilaIso(date?: string, time?: string) {
    if (!date || !time) return undefined;
    const match = time.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return undefined;
    let hour = Number(match[1]); const minute = Number(match[2]); const meridiem = match[3]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return undefined;
    return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`).toISOString();
  }

  private looksLikeDateOnly(value: string) {
    return /^(?:\d{4}-\d{2}-\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/i.test(value);
  }
}
