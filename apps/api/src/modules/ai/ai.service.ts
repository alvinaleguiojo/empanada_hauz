import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult, CustomerIntent } from "./types";

const CUSTOMER_SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz.\n\nThe CURRENT CUSTOMER MESSAGE is the highest priority. Answer that message first.\nPrevious conversation is background only and must never override a new or unrelated question.\nTreat each new message as a new question unless the customer clearly refers to an existing order.\nDo not repeat the previous assistant answer unless the current message asks for it.\nA greeting is not an order. A flavor or quantity request is not confirmation.\nOnly treat a confirmation as confirmation when the customer is clearly confirming a complete order.\nKeep replies short, clear, natural, and helpful.\nUse Cebuano when the customer uses Cebuano, otherwise English.\nDo not ask for information already provided.\nDo not ask for a preferred delivery or pickup time.\nDo not invent prices, delivery fees, times, policies, availability, or order details.\nDo not claim an order was created.\n\nBusiness facts:\n- Minimum order: 10 pcs; mixed flavors are allowed.\n- Bacon with Cheese ₱35; Pork Regular ₱20; Pork Regular with Egg ₱25; Pork Asado ₱30.\n- Ham & Cheese ₱25; Chicken ₱20; Chicken with Egg ₱25; Ube Empanada ₱25.\n- Mango ₱25; Choco ₱30; Beef ₱35; Beef with Egg ₱40.\n- Best sellers: Pork Regular with Egg, Chicken with Egg, Beef with Egg.\n- Baked is ₱5 more than the original price. Preparation is about 1 hour.\n- Payment: GCash or COD. GCash: Alvin Aleguiojo, 09453916796.\n- Pickup: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao.\n- Maxim delivery is available. For Maxim, Address, Landmark, and Contact # are required.\n- Delivery fee varies by location. For the current delivery fee and priority number, direct customers to https://www.empanadahauz.com.\n- Orders of 30 pcs or more get 20% off the delivery fee only when the customer asks about a discount.\n- If today is Sunday in Asia/Manila, the business is closed and Sunday orders must not be created.\n- When presenting a complete order summary before confirmation, end exactly with: Please confirm if all the details above are correct. 😊\n- Do NOT use that confirmation sentence after a greeting, menu/flavor list, price answer, delivery-fee answer, or general inquiry.\n- "hm" means how much. "df" means delivery fee.\n`;

interface OllamaResponse { message?: { content?: string } }

type Flavor = { name: string; quantity: number; unitPrice?: number; subtotal?: number };

const PRICES: Record<string, number> = {
  "bacon with cheese": 35,
  "pork regular": 20,
  "pork regular with egg": 25,
  "pork asado": 30,
  "ham & cheese": 25,
  "ham and cheese": 25,
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

const FLAVOR_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "Bacon with Cheese", aliases: ["bacon with cheese"] },
  { canonical: "Pork Regular with Egg", aliases: ["pork regular with egg", "pork with egg"] },
  { canonical: "Pork Regular", aliases: ["pork regular", "pork"] },
  { canonical: "Pork Asado", aliases: ["pork asado", "asado"] },
  { canonical: "Ham & Cheese", aliases: ["ham & cheese", "ham and cheese", "ham cheese"] },
  { canonical: "Chicken with Egg", aliases: ["chicken with egg", "chicken egg"] },
  { canonical: "Chicken", aliases: ["chicken"] },
  { canonical: "Ube Empanada", aliases: ["ube empanada", "ube"] },
  { canonical: "Mango", aliases: ["mango"] },
  { canonical: "Choco", aliases: ["choco", "chocolate"] },
  { canonical: "Beef with Egg", aliases: ["beef with egg", "beef egg"] },
  { canonical: "Beef", aliases: ["beef"] }
];

@Injectable()
export class AiService {
  protected readonly logger = new Logger(AiService.name);
  protected readonly baseUrl: string;
  protected readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:8b");
  }

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[] }): Promise<AIIntentResult> {
    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const customerName = context?.customerName?.trim() || "Customer";
    const recentMessages = (context?.recentMessages ?? []).slice(-4);
    const replyContext = this.buildReplyContext(message, recentMessages);
    const systemPrompt = `${CUSTOMER_SYSTEM_PROMPT}\nCurrent date/time in Asia/Manila: ${now}\nCustomer name: ${customerName}`;

    this.logger.log(`AI path=OLLAMA model=${this.model} message=${JSON.stringify(message)}`);

    const suggestedReply = await this.generateCustomerReply(systemPrompt, message, replyContext);
    const details = this.buildOrderDetails(message, recentMessages);
    const intent = this.inferIntent(message, details);
    const result: AIIntentResult = {
      intent,
      confidence: details.flavors.length || details.confirmed || details.deliveryMethod || details.paymentMethod ? 1 : 0,
      details,
      suggestedReply,
      source: "ollama"
    };

    this.logger.log(`AI path=OLLAMA_SUCCESS intent=${result.intent} extraction=APP`);
    return result;
  }

  async generateOrderResultReply(outcome: "created" | "failed", orderNumber?: string): Promise<string> {
    const system = `${CUSTOMER_SYSTEM_PROMPT}\n\nThis is a private order-processing status update. Generate only the final short customer-facing reply. Never invent information. Do not mention internal tools, MCP, application code, or system details.`;
    const status = outcome === "created"
      ? `The application successfully created the customer's confirmed order.${orderNumber ? ` Order number: ${orderNumber}.` : ""}`
      : "The application could not create the customer's confirmed order.";
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.25, num_predict: 96, num_ctx: 1536 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: status }
      ]
    }, "Ollama order result reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty order result reply");
    return reply.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  private async generateCustomerReply(systemPrompt: string, message: string, conversationContext: string): Promise<string> {
    const body = {
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 128, num_ctx: 2048 },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nAnswer ONLY the current customer message. The response will be sent to Messenger exactly as written. Ignore previous assistant answers unless the current message clearly asks to continue or confirm them. Do not output JSON, labels, analysis, intent names, or meta-commentary.` },
        { role: "user", content: `CURRENT CUSTOMER MESSAGE:\n${message}\n\n${conversationContext}` }
      ]
    };

    const response = await this.ollamaChat(body, "Ollama customer reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty customer reply");
    this.logger.log(`AI customer reply generated model=${this.model} message=${JSON.stringify(message)}`);
    return reply.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  private async ollamaChat(body: Record<string, unknown>, errorPrefix: string): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`${errorPrefix}: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildReplyContext(message: string, recentMessages: string[]): string {
    if (!recentMessages.length) return "CONVERSATION CONTEXT: none. Treat this as a new interaction.";

    const lower = message.toLowerCase().trim();
    const explicitFollowUp = /^(yes|yeah|yep|yes that's correct|yes thats correct|that's correct|thats correct|correct|confirmed|confirm|go ahead|proceed|okay proceed|same|same order|pickup|pick up|maxim|gcash|cod|continue|continue my order)$/i.test(lower)
      || /\b(change|remove|add|instead|same order)\b/i.test(lower);
    const freshRequest = /\b\d+\s*(?:pcs?|pieces?)\b/i.test(lower)
      || /\b(bacon|pork|asado|ham|cheese|chicken|ube|mango|choco|chocolate|beef)\b/i.test(lower)
      || /\b(hm|how much|price|pila|tagpila|presyo|df|delivery fee)\b/i.test(lower)
      || /\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(lower);

    if (explicitFollowUp && !freshRequest) {
      return `CONVERSATION CONTEXT (only for the explicit follow-up; current message wins):\n${recentMessages.slice(-2).join("\n")}`;
    }

    if (explicitFollowUp && /\b(same order|change|remove|add|instead)\b/i.test(lower)) {
      return `CONVERSATION CONTEXT (existing order only; current message wins):\n${recentMessages.slice(-2).join("\n")}`;
    }

    return "CONVERSATION CONTEXT: none. Treat the current message as a fresh request. Do not repeat any previous answer.";
  }

  private buildOrderDetails(message: string, recentMessages: string[]): AIIntentResult["details"] {
    const lower = message.toLowerCase().trim();
    const continuation = /^(yes|yeah|yep|yes that's correct|yes thats correct|that's correct|thats correct|correct|confirmed|confirm|go ahead|proceed|okay proceed|same|same order|pickup|pick up|maxim|gcash|cod|continue|continue my order)$/i.test(lower)
      || /\b(change|remove|add|instead|same order)\b/i.test(lower);
    const freshOrder = /\b\d+\s*(?:pcs?|pieces?)\b/i.test(lower) || /\b(bacon|pork|asado|ham|chicken|ube|mango|choco|chocolate|beef)\b/i.test(lower);

    const base = continuation && !freshOrder ? this.latestStoredOrderState(recentMessages) : undefined;
    const parsed = this.parseCurrentMessage(message);
    const merged: AIIntentResult["details"] = {
      ...(base ?? { flavors: [], missingFields: [], confirmed: false }),
      ...parsed,
      flavors: parsed.flavors.length ? parsed.flavors : (base?.flavors ?? []),
      missingFields: []
    };

    if (continuation && this.isConfirmationMessage(lower) && base) {
      merged.confirmed = true;
    } else if (!this.isConfirmationMessage(lower)) {
      merged.confirmed = false;
    }

    merged.quantity = merged.flavors.length ? merged.flavors.reduce((sum, item) => sum + item.quantity, 0) : merged.quantity;
    merged.totalAmount = merged.flavors.length ? merged.flavors.reduce((sum, item) => sum + (item.subtotal ?? item.quantity * (item.unitPrice ?? 0)), 0) : merged.totalAmount;
    merged.missingFields = this.calculateMissingFields(merged, lower);
    return merged;
  }

  private latestStoredOrderState(recentMessages: string[]) {
    for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
      const line = recentMessages[i];
      const marker = line.match(/STRUCTURED_ORDER_STATE:\s*(\{.*\})/i);
      if (!marker) continue;
      try {
        const parsed = JSON.parse(marker[1]) as { details?: AIIntentResult["details"] };
        if (parsed?.details?.flavors) return parsed.details;
      } catch { /* ignore malformed historical state */ }
    }
    return undefined;
  }

  private parseCurrentMessage(message: string): AIIntentResult["details"] {
    const lower = message.toLowerCase();
    const details: AIIntentResult["details"] = { flavors: [], missingFields: [], confirmed: false };
    const quantities = new Map<string, number>();

    for (const flavor of FLAVOR_ALIASES) {
      for (const alias of flavor.aliases) {
        const before = new RegExp(`\\b(\\d+)\\s*(?:pcs?|pieces?)\\s*(?:of\\s+)?${this.escapeRegExp(alias)}\\b`, "i").exec(message);
        const after = new RegExp(`\\b${this.escapeRegExp(alias)}\\b[^\\n,;]*(?:-|:|with)?[^\\n,;]{0,20}?(\\d+)\\s*(?:pcs?|pieces?)\\b`, "i").exec(message);
        const quantity = before?.[1] ?? after?.[1];
        if (quantity) {
          quantities.set(flavor.canonical, Number(quantity));
          break;
        }
        if (new RegExp(`\\b${this.escapeRegExp(alias)}\\b`, "i").test(message) && /^\\s*\\d+\\s*(?:pcs?|pieces?)\\b/i.test(message)) {
          const leading = message.match(/^\\s*(\\d+)\\s*(?:pcs?|pieces?)\\b/i);
          if (leading) quantities.set(flavor.canonical, Number(leading[1]));
        }
      }
    }

    for (const [name, quantity] of quantities) {
      const key = name.toLowerCase();
      const unitPrice = PRICES[key];
      details.flavors.push({ name, quantity, unitPrice, subtotal: unitPrice * quantity });
    }

    const quantityMatch = lower.match(/\b(\d+)\s*(?:pcs?|pieces?)\b/i);
    if (quantityMatch) details.quantity = Number(quantityMatch[1]);
    if (!details.flavors.length && details.quantity && /\b(order|want|like|need)\b/i.test(lower)) details.flavors = [];

    if (/\b(maxim|deliver|delivery)\b/i.test(lower)) details.deliveryMethod = "maxim";
    if (/\b(pickup|pick up|pick-up)\b/i.test(lower)) details.deliveryMethod = "pickup";
    if (/\b(gcash)\b/i.test(lower)) details.paymentMethod = "gcash";
    if (/\b(cod|cash on delivery|cash)\b/i.test(lower)) details.paymentMethod = "cod";

    const phone = message.match(/(?:contact(?: number| #)?|phone(?: number)?|cp|mobile)?\s*[:\-]?\s*(\+?63\s*\d{10}|09\d{9})\b/i);
    if (phone) details.contactNumber = phone[1].replace(/\s+/g, "");

    const landmark = message.match(/(?:landmark)\s*[:\-]\s*([^,;\n]+)/i);
    if (landmark) details.landmark = landmark[1].trim();
    const address = message.match(/(?:address)\s*[:\-]\s*([^,;\n]+)/i);
    if (address) details.address = address[1].trim();

    if (details.flavors.length === 0 && details.quantity && /\b(pork|chicken|ube|mango|beef|asado|ham|bacon|choco|chocolate)\b/i.test(lower)) {
      const matched = FLAVOR_ALIASES.find((item) => item.aliases.some((alias) => new RegExp(`\\b${this.escapeRegExp(alias)}\\b`, "i").test(lower)));
      if (matched) {
        const unitPrice = PRICES[matched.canonical.toLowerCase()];
        details.flavors = [{ name: matched.canonical, quantity: details.quantity, unitPrice, subtotal: unitPrice * details.quantity }];
      }
    }

    return details;
  }

  private calculateMissingFields(details: AIIntentResult["details"], lower: string): string[] {
    const missing: string[] = [];
    const quantity = Number(details.quantity ?? 0);
    const flavorQuantity = details.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (details.flavors.length === 0) missing.push("flavors");
    if (!quantity || flavorQuantity !== quantity) missing.push("quantity");
    if (quantity < 10) missing.push("minimumOrder");
    if (!details.deliveryMethod) missing.push("deliveryMethod");
    if (!details.paymentMethod) missing.push("paymentMethod");
    if (details.deliveryMethod === "maxim") {
      if (!details.address?.trim()) missing.push("address");
      if (!details.landmark?.trim()) missing.push("landmark");
      if (!details.contactNumber?.trim()) missing.push("contactNumber");
    }
    if (/\b(sunday)\b/i.test(lower)) missing.push("businessClosedSunday");
    return [...new Set(missing)];
  }

  private isConfirmationMessage(lower: string) {
    return /^(yes|yeah|yep|yes that's correct|yes thats correct|that's correct|thats correct|correct|confirmed|confirm|go ahead|proceed|okay proceed|place my order|place the order|order it)$/i.test(lower.trim());
  }

  private inferIntent(message: string, details: AIIntentResult["details"]): CustomerIntent {
    const lower = message.toLowerCase();
    if (this.isConfirmationMessage(lower)) return "order_confirmation";
    if (/\b(delivery fee|df|delivery|deliver|maxim)\b/.test(lower)) return "delivery_request";
    if (/\b(pickup|pick up)\b/.test(lower)) return "pickup_request";
    if (/\b(hm|how much|price|pila|tagpila|presyo)\b/.test(lower) && details.flavors.length === 0) return "pricing_question";
    if (details.flavors.length || /\border\b|\b\d+\s*(?:pcs?|pieces?)\b/.test(lower)) return "reservation";
    return "inquiry";
  }

  private escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
}
