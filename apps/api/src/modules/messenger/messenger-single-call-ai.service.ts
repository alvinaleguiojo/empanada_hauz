import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AIIntentResult, CustomerIntent, DeliveryMethodValue } from "../ai/types";
import type { AIOrderAction, AIOrderActionResult } from "../ai/ai-order-action.service";

interface OllamaResponse { message?: { content?: string } }

type CachedResult = {
  action: AIOrderActionResult;
  ai: AIIntentResult;
  key: string;
  createdAt: number;
};

const FLAVORS = [
  "Bacon with Cheese", "Pork Regular", "Pork Regular with Egg", "Pork Asado",
  "Ham & Cheese", "Chicken", "Chicken with Egg", "Ube Empanada", "Mango", "Choco", "Beef", "Beef with Egg"
];

const PRICES: Record<string, number> = {
  "bacon with cheese": 35,
  "pork regular": 20,
  "pork regular with egg": 25,
  "pork asado": 30,
  "ham & cheese": 25,
  "ham and cheese": 25,
  "ham cheese": 25,
  "ham with cheese": 25,
  "ham": 25,
  "chicken": 20,
  "chicken with egg": 25,
  "ube": 25,
  "ube empanada": 25,
  "mango": 25,
  "choco": 30,
  "chocolate": 30,
  "beef": 35,
  "beef with egg": 40
};

const SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz and the semantic order-action interpreter for Messenger.

CURRENT CUSTOMER MESSAGE has highest priority. Interpret it semantically, not by exact phrase matching. Understand typos, shorthand, abbreviations, phonetic spellings, incomplete phrases, casual Messenger language, and Cebuano/English mixing.
Resolve follow-up references using recent conversation and supplied application state. Do not discard known order information merely because it is not repeated.

ACTION PRECEDENCE:
1. Business-information questions are inquiry.
2. Requests to view/show/send/review an order summary or details are summary and are not confirmation.
3. Accepting the immediately preceding complete pending new-order summary is confirm.
4. Changing an already-created order is modify_existing. Changing only date/time is still modify_existing.
5. Cancelling an already-created order is cancel_existing.
6. Asking whether an order exists/was placed/current status is status.
7. Starting or continuing a separate/pending order is new_order.
8. Otherwise inquiry.

BUSINESS INFORMATION includes menu, prices, flavors, best sellers, baked option, minimum order, payment, pickup location, delivery availability/fees, preparation time, and opening/closing.
Minimum order is 10 pcs; mixed flavors allowed.
Prices: Bacon with Cheese 35; Pork Regular 20; Pork Regular with Egg 25; Pork Asado 30; Ham & Cheese 25; Chicken 20; Chicken with Egg 25; Ube Empanada 25; Mango 25; Choco 30; Beef 35; Beef with Egg 40.
Baked is 5 more. Preparation is about 1 hour.
Payment is GCash or COD. GCash: Alvin Aleguiojo, 09453916796.
Pickup/business location: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao.
Maxim delivery is available. For Maxim delivery, Address, Landmark, and Contact # are required. Delivery fee varies by location.
50+ pcs qualifies for 10% off the food/order total, but mention/apply it only when the customer asks about a discount. 30+ pcs gets 20% off the delivery fee, also only when the customer asks about a discount.

CONFIRMATION: confirmed=true only when the CURRENT CUSTOMER MESSAGE clearly accepts the immediately preceding complete pending new-order summary. Questions, changes, new information, and summary requests are not confirmation.
CASH means COD. Only explicit GCash means GCash.
DATE/TIME: use CURRENT DATE/TIME IN ASIA/MANILA. Resolve today/tomorrow/next Monday/etc. to concrete dates. For an existing-order modification, keep the source date separate from the requested target date.
DELIVERY REUSE: reuseExistingDelivery=true only when the customer clearly asks to copy/keep previous delivery details for a separate new order. Never infer payment reuse.

Return ONLY compact valid JSON matching this shape:
{
  "orderAction":"new_order|modify_existing|cancel_existing|status|summary|inquiry|confirm",
  "confidence":0.0,
  "newOrderFlowActive":false,
  "reuseExistingDelivery":false,
  "referencedOrderDate":"YYYY-MM-DD or empty",
  "requestedDeliveryDate":"YYYY-MM-DD or empty",
  "requestedDeliveryTime":"HH:MM or empty",
  "details":{
    "flavorAction":"none|replace|add|remove",
    "flavors":[{"name":"Canonical flavor name","quantity":0}],
    "quantity":0,
    "location":"",
    "deliveryMethod":"pickup|maxim",
    "preferredTime":"",
    "deliveryDate":"YYYY-MM-DD",
    "address":"",
    "landmark":"",
    "contactNumber":"",
    "paymentMethod":"cod|gcash",
    "confirmed":false
  },
  "suggestedReply":"short customer-facing Messenger reply"
}

For a summary request, suggestedReply must show the available current order details when they are supplied. Do not ask for confirmation for a summary request.
Never claim an order was created/placed/confirmed unless APPLICATION RESULT later says the application actually created it.
Never expose JSON, internal action names, tools, MCP, or implementation details.
Use Cebuano when the customer uses Cebuano, otherwise English. Keep replies concise and natural.`;

@Injectable()
export class MessengerSingleCallAiService {
  private readonly logger = new Logger(MessengerSingleCallAiService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CachedResult>();

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct");
    const configuredTimeout = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS", "180000"));
    this.timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 180000;
  }

  async analyze(message: string, context: { recentMessages?: string[]; hasActiveOrder?: boolean; hasPendingNewOrder?: boolean; existingDeliveryDetails?: { deliveryMethod?: string | null; address?: string | null; location?: string | null; contactNumber?: string | null; paymentMethod?: string | null; preferredSchedule?: string | null } }): Promise<AIOrderActionResult> {
    const key = this.makeKey(message, context.recentMessages ?? [], context.hasActiveOrder, context.hasPendingNewOrder);
    const cached = this.getCached(key);
    if (cached) return cached.action;
    const result = await this.runSingleCall(message, context);
    this.cache.set(key, result);
    return result.action;
  }

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[]; activeOrderState?: AIIntentResult["details"] }): Promise<AIIntentResult> {
    const recentMessages = context?.recentMessages ?? [];
    const key = this.makeKey(message, recentMessages.filter((line) => !/^APPLICATION /.test(line)), Boolean(context?.activeOrderState), Boolean(context?.activeOrderState?.flavors?.length));
    const cached = this.getCached(key);
    if (cached) return this.mergeActiveState(cached.ai, context?.activeOrderState);

    const fallback = await this.runSingleCall(message, {
      recentMessages,
      hasActiveOrder: Boolean(context?.activeOrderState),
      hasPendingNewOrder: Boolean(context?.activeOrderState?.flavors?.length),
      existingDeliveryDetails: context?.activeOrderState ? {
        deliveryMethod: context.activeOrderState.deliveryMethod,
        address: context.activeOrderState.address,
        location: context.activeOrderState.landmark,
        contactNumber: context.activeOrderState.contactNumber,
        paymentMethod: context.activeOrderState.paymentMethod,
        preferredSchedule: undefined
      } : undefined
    });
    return this.mergeActiveState(fallback.ai, context?.activeOrderState);
  }

  async generateActionResultReply(_message: string, _action: AIOrderAction, result: string, _recentMessages: string[] = []): Promise<string> {
    return this.renderApplicationResult(result);
  }

  private async runSingleCall(message: string, context: { recentMessages?: string[]; hasActiveOrder?: boolean; hasPendingNewOrder?: boolean; existingDeliveryDetails?: { deliveryMethod?: string | null; address?: string | null; location?: string | null; contactNumber?: string | null; paymentMethod?: string | null; preferredSchedule?: string | null } }): Promise<CachedResult> {
    const recent = (context.recentMessages ?? []).filter((line) => !/^APPLICATION AI ORDER ACTION:/.test(line)).slice(-16);
    const delivery = context.existingDeliveryDetails ?? {};
    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const user = `CURRENT DATE/TIME IN ASIA/MANILA: ${now}\nACTIVE DATABASE ORDER EXISTS: ${Boolean(context.hasActiveOrder)}\nPENDING NEW ORDER EXISTS: ${Boolean(context.hasPendingNewOrder)}\nEXISTING DELIVERY DETAILS: deliveryMethod=${delivery.deliveryMethod ?? "none"}; address=${delivery.address ?? "none"}; landmark=${delivery.location ?? "none"}; contactNumber=${delivery.contactNumber ?? "none"}; paymentMethod=${delivery.paymentMethod ?? "none"}; scheduledAt=${delivery.preferredSchedule ?? "none"}\nRECENT CONVERSATION:\n${recent.join("\n") || "none"}\nCURRENT CUSTOMER MESSAGE:\n${message}`;
    const response = await this.chat({ model: this.model, stream: false, think: false, format: "json", keep_alive: "10m", options: { temperature: 0.15, num_predict: 448, num_ctx: 4096 }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: user }] });
    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty single-call Messenger response");
    const parsed = JSON.parse(this.cleanJson(raw)) as Partial<CombinedResponse>;
    const orderAction = this.parseAction(parsed.orderAction);
    const details = this.normalizeDetails(parsed.details);
    const confirmed = Boolean(details.confirmed) && orderAction === "confirm";
    details.confirmed = confirmed;
    const action: AIOrderActionResult = {
      orderAction,
      confidence: this.clamp(Number(parsed.confidence)),
      newOrderFlowActive: Boolean(parsed.newOrderFlowActive) || context.hasPendingNewOrder === true || orderAction === "new_order" || orderAction === "confirm",
      reuseExistingDelivery: Boolean(parsed.reuseExistingDelivery) && Boolean(context.hasPendingNewOrder),
      referencedOrderDate: this.cleanDate(parsed.referencedOrderDate),
      requestedDeliveryDate: this.cleanDate(parsed.requestedDeliveryDate),
      requestedDeliveryTime: this.cleanTime(parsed.requestedDeliveryTime)
    };
    const intent = this.intentFromAction(orderAction, details);
    const ai: AIIntentResult = {
      intent,
      confidence: action.confidence,
      details: {
        ...details,
        confirmed,
        missingFields: this.getMissingFields(details)
      },
      suggestedReply: typeof parsed.suggestedReply === "string" && parsed.suggestedReply.trim() ? parsed.suggestedReply.trim() : this.defaultReply(orderAction, details),
      source: "ollama"
    };
    return { action, ai, key: "", createdAt: Date.now() };
  }

  private normalizeDetails(raw: CombinedResponse["details"] | undefined): AIIntentResult["details"] {
    const source = raw ?? {};
    const flavors = Array.isArray(source.flavors) ? source.flavors.map((item) => {
      const name = this.canonicalFlavor(typeof item?.name === "string" ? item.name : "");
      const quantity = Number(item?.quantity ?? 0);
      const unitPrice = name ? PRICES[name.toLowerCase()] : undefined;
      return name && Number.isFinite(quantity) && quantity > 0 ? { name, quantity, unitPrice, subtotal: unitPrice ? unitPrice * quantity : undefined } : null;
    }).filter((item): item is NonNullable<typeof item> => item !== null) : [];
    const totalAmount = flavors.length ? flavors.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) : undefined;
    return {
      quantity: this.optionalNumber(source.quantity),
      location: this.optionalString(source.location),
      deliveryMethod: source.deliveryMethod === "pickup" || source.deliveryMethod === "maxim" ? source.deliveryMethod : undefined,
      preferredTime: this.optionalString(source.preferredTime),
      deliveryDate: this.cleanDate(source.deliveryDate),
      address: this.optionalString(source.address),
      landmark: this.optionalString(source.landmark),
      contactNumber: this.optionalString(source.contactNumber),
      paymentMethod: source.paymentMethod === "cod" || source.paymentMethod === "gcash" ? source.paymentMethod : undefined,
      flavors,
      totalAmount,
      confirmed: Boolean(source.confirmed),
      missingFields: []
    };
  }

  private mergeActiveState(ai: AIIntentResult, active?: AIIntentResult["details"]): AIIntentResult {
    if (!active) return ai;
    if (ai.intent !== "inquiry" && ai.details.flavors.length === 0 && active.flavors.length && !ai.details.confirmed) {
      ai.details.flavors = active.flavors;
      ai.details.totalAmount = active.totalAmount;
      ai.details.quantity = active.quantity;
    }
    ai.details.missingFields = this.getMissingFields(ai.details);
    return ai;
  }

  private getMissingFields(details: AIIntentResult["details"]): string[] {
    const missing: string[] = [];
    const quantity = details.flavors.reduce((sum, item) => sum + item.quantity, 0);
    if (!details.flavors.length) missing.push("flavors");
    if (details.flavors.length && quantity < 1) missing.push("quantity");
    if (details.flavors.length && quantity < 10) missing.push("minimumOrder");
    if (!details.deliveryMethod) missing.push("deliveryMethod");
    if (!details.paymentMethod) missing.push("paymentMethod");
    if (details.deliveryMethod === "maxim") {
      if (!details.address) missing.push("address");
      if (!details.landmark) missing.push("landmark");
      if (!details.contactNumber) missing.push("contactNumber");
    }
    return missing;
  }

  private renderApplicationResult(result: string): string {
    const text = result.replace(/^APPLICATION RESULT:\s*/i, "").trim();
    if (/successfully created/i.test(text)) {
      const order = text.match(/Order number:\s*([^\.]+)\.?/i)?.[1]?.trim();
      return order ? `Your order has been confirmed and created successfully. Order number: ${order}. 😊` : "Your order has been confirmed and created successfully. 😊";
    }
    if (/successfully updated/i.test(text)) {
      const order = text.match(/existing order\s+([^\s]+)\s+was successfully updated/i)?.[1];
      return order ? `Your order ${order} has been updated successfully. 😊` : "Your existing order has been updated successfully. 😊";
    }
    if (/could not be created/i.test(text)) return "Sorry, I couldn’t complete the order. No order was created. Please check the details and try again. 😊";
    if (/could not be updated/i.test(text)) return "Sorry, I couldn’t update the order. No changes were completed. 😊";
    if (/already has an active order/i.test(text)) return "You already have an active order. Would you like to modify that order or place a separate new order? 😊";
    if (/No active order was found/i.test(text)) return "I couldn’t find an active order matching that request. 😊";
    return text;
  }

  private defaultReply(action: AIOrderAction, details: AIIntentResult["details"]): string {
    if (action === "summary") return details.flavors.length ? `Your current order is ${details.flavors.map((item) => `${item.quantity} pcs ${item.name}`).join(", ")}.` : "I don’t have a current order summary yet.";
    if (action === "confirm") return "Thanks! I’ll process the confirmed order.";
    if (action === "new_order") return details.missingFields.length ? `Sure! Please provide the next missing order detail.` : "Sure! 😊";
    return "Sure! How can I help? 😊";
  }

  private canonicalFlavor(value: string): string {
    const key = value.trim().toLowerCase();
    const aliases: Record<string, string> = {
      "bacon with cheese": "Bacon with Cheese", "pork regular": "Pork Regular", "pork regular with egg": "Pork Regular with Egg",
      "pork asado": "Pork Asado", "ham & cheese": "Ham & Cheese", "ham and cheese": "Ham & Cheese", "ham cheese": "Ham & Cheese", "ham": "Ham & Cheese",
      "chicken": "Chicken", "chicken with egg": "Chicken with Egg", "ube": "Ube Empanada", "ube empanada": "Ube Empanada",
      "mango": "Mango", "choco": "Choco", "chocolate": "Choco", "beef": "Beef", "beef with egg": "Beef with Egg"
    };
    return aliases[key] ?? FLAVORS.find((item) => item.toLowerCase() === key) ?? "";
  }

  private intentFromAction(action: AIOrderAction, details: AIIntentResult["details"]): CustomerIntent {
    if (action === "confirm") return "order_confirmation";
    if (action === "new_order" || action === "modify_existing" || action === "cancel_existing") return "reservation";
    if (action === "inquiry" && details.deliveryMethod === "maxim") return "delivery_request";
    if (action === "inquiry" && details.deliveryMethod === "pickup") return "pickup_request";
    if (action === "inquiry" && details.flavors.length === 0) return "inquiry";
    return "inquiry";
  }

  private parseAction(value: unknown): AIOrderAction {
    return value === "new_order" || value === "modify_existing" || value === "cancel_existing" || value === "status" || value === "summary" || value === "confirm" ? value : "inquiry";
  }
  private optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
  private optionalNumber(value: unknown): number | undefined { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : undefined; }
  private clamp(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
  private cleanDate(value: unknown): string | undefined { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : undefined; }
  private cleanTime(value: unknown): string | undefined { return typeof value === "string" && /^\d{2}:\d{2}$/.test(value.trim()) ? value.trim() : undefined; }
  private cleanJson(raw: string): string { const start = raw.indexOf("{"); const end = raw.lastIndexOf("}"); return start >= 0 && end > start ? raw.slice(start, end + 1) : raw; }
  private makeKey(message: string, recentMessages: string[], hasActiveOrder?: boolean, hasPendingNewOrder?: boolean): string { return `${message}\n${recentMessages.filter((line) => !/^APPLICATION /.test(line)).join("\n")}\n${Boolean(hasActiveOrder)}\n${Boolean(hasPendingNewOrder)}`; }
  private getCached(key: string): CachedResult | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;
    if (Date.now() - cached.createdAt > 60_000) { this.cache.delete(key); return undefined; }
    return cached;
  }

  private async chat(body: Record<string, unknown>): Promise<OllamaResponse> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      const durationMs = Date.now() - startedAt;
      this.logger.log(`Single-call Ollama completed: model=${this.model} durationMs=${durationMs}`);
      if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}

type CombinedResponse = {
  orderAction?: unknown;
  confidence?: unknown;
  newOrderFlowActive?: unknown;
  reuseExistingDelivery?: unknown;
  referencedOrderDate?: unknown;
  requestedDeliveryDate?: unknown;
  requestedDeliveryTime?: unknown;
  details?: {
    flavorAction?: unknown;
    flavors?: Array<{ name?: unknown; quantity?: unknown }>;
    quantity?: unknown;
    location?: unknown;
    deliveryMethod?: unknown;
    preferredTime?: unknown;
    deliveryDate?: unknown;
    address?: unknown;
    landmark?: unknown;
    contactNumber?: unknown;
    paymentMethod?: unknown;
    confirmed?: unknown;
  };
  suggestedReply?: unknown;
};
