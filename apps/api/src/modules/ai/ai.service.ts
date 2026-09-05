import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult, CustomerIntent } from "./types";

const CUSTOMER_SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz.

The CURRENT CUSTOMER MESSAGE is highest priority. Answer it directly.
Use application order facts as authoritative structured state; never override them.
A greeting starts a fresh conversation unless the customer explicitly refers to an existing order.
A flavor-only request needs a quantity; ask how many pcs.
An order with missing required fields is NOT ready for confirmation.
Never ask for confirmation when required fields are missing.
For Maxim delivery, collect Address, Landmark, and Contact # before confirmation; if those are missing, ask for them explicitly.
Pickup does not require delivery address details.
CASH means COD. Only explicit GCash means GCash. Never reinterpret CASH as GCash.
A summary request means SHOW THE ORDER SUMMARY; it is not itself a confirmation.
Never expose internal field names, application validation wording, JSON, intent names, tools, or MCP details.
Never say an order is confirmed/placed/created unless application state says READY and the application actually created it.
Use Cebuano when the customer uses Cebuano, otherwise English.
Keep replies short, clear, natural, and helpful.
Do not ask for information already provided.
Do not ask for a preferred delivery or pickup time.
Do not invent prices, delivery fees, times, policies, availability, or order details.

Business facts:
- Minimum order: 10 pcs; mixed flavors allowed.
- Bacon with Cheese ₱35; Pork Regular ₱20; Pork Regular with Egg ₱25; Pork Asado ₱30.
- Ham & Cheese ₱25; Chicken ₱20; Chicken with Egg ₱25; Ube Empanada ₱25.
- Mango ₱25; Choco ₱30; Beef ₱35; Beef with Egg ₱40.
- Best sellers: Pork Regular with Egg, Chicken with Egg, Beef with Egg.
- Baked is ₱5 more. Preparation is about 1 hour.
- Payment: GCash or COD. GCash: Alvin Aleguiojo, 09453916796.
- Pickup: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao.
- Maxim delivery is available; Address, Landmark, and Contact # are required.
- Delivery fee varies by location; current delivery fee and priority number are on https://www.empanadahauz.com.
- 30+ pcs gets 20% off the delivery fee only when the customer asks about a discount.
- If today is Sunday in Asia/Manila, the business is closed.
- A complete pre-confirmation summary must end exactly with: Please confirm if all the details above are correct. 😊
`;

interface OllamaResponse { message?: { content?: string } }
type Details = AIIntentResult["details"];

const PRICES: Record<string, number> = {
  "bacon with cheese": 35, "pork regular": 20, "pork regular with egg": 25, "pork asado": 30,
  "ham & cheese": 25, "ham and cheese": 25, "ham cheese": 25, "chicken": 20, "chicken with egg": 25,
  "ube": 25, "ube empanada": 25, "mango": 25, "choco": 30, "chocolate": 30, "beef": 35, "beef with egg": 40
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

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[]; activeOrderState?: Details }): Promise<AIIntentResult> {
    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const recentMessages = (context?.recentMessages ?? []).slice(-6);
    const lower = message.toLowerCase().trim();
    const activeOrderState = context?.activeOrderState && (this.isContinuationMessage(lower) || this.isOrderFieldAnswer(lower))
      ? context.activeOrderState
      : undefined;
    const details = this.buildOrderDetails(message, activeOrderState);
    const systemPrompt = `${CUSTOMER_SYSTEM_PROMPT}\nCurrent date/time in Asia/Manila: ${now}\nCustomer name: ${context?.customerName?.trim() || "Customer"}`;
    const replyContext = this.buildReplyContext(message, recentMessages, activeOrderState, details);
    const suggestedReply = await this.generateCustomerReply(systemPrompt, message, replyContext);
    const intent = this.inferIntent(message, details);
    return { intent, confidence: details.flavors.length || details.confirmed || details.deliveryMethod || details.paymentMethod ? 1 : 0, details, suggestedReply, source: "ollama" };
  }

  async generateOrderResultReply(outcome: "created" | "failed", orderNumber?: string): Promise<string> {
    const status = outcome === "created"
      ? `APPLICATION RESULT: The application successfully created the customer's confirmed order.${orderNumber ? ` Order number: ${orderNumber}.` : ""}`
      : "APPLICATION RESULT: The application could not create the customer's confirmed order.";
    const response = await this.ollamaChat({
      model: this.model, stream: false, think: false,
      options: { temperature: 0.2, num_predict: 96, num_ctx: 1536 },
      messages: [
        { role: "system", content: `${CUSTOMER_SYSTEM_PROMPT}\nGenerate only the final short customer-facing reply. Never mention internal tools or MCP.` },
        { role: "user", content: status }
      ]
    }, "Ollama order result reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty order result reply");
    return this.cleanReply(reply);
  }

  private async generateCustomerReply(systemPrompt: string, message: string, context: string): Promise<string> {
    const response = await this.ollamaChat({
      model: this.model, stream: false, think: false,
      options: { temperature: 0.2, num_predict: 160, num_ctx: 2048 },
      messages: [
        { role: "system", content: `${systemPrompt}\n\nAnswer ONLY the current customer message. APPLICATION ORDER FACTS and NEXT ACTION DIRECTIVE are authoritative. Answer questions directly. A summary request must return the summary; do not replace it with a confirmation request. If required fields are missing, never ask for confirmation. For Maxim, ask explicitly for any missing Address, Landmark, or Contact #. CASH is COD. Do not output internal field names or meta-commentary.` },
        { role: "user", content: `CURRENT CUSTOMER MESSAGE:\n${message}\n\n${context}` }
      ]
    }, "Ollama customer reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty customer reply");
    this.logger.log(`AI customer reply generated model=${this.model} message=${JSON.stringify(message)}`);
    return this.cleanReply(reply);
  }

  private async ollamaChat(body: Record<string, unknown>, errorPrefix: string): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`${errorPrefix}: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally { clearTimeout(timeout); }
  }

  private buildReplyContext(message: string, recentMessages: string[], activeOrderState?: Details, currentDetails?: Details): string {
    const lower = message.toLowerCase().trim();
    if (this.isOrderStatusQuestion(lower) && !activeOrderState) {
      return "APPLICATION ORDER FACTS: There is no active order in the current conversation.\nNEXT ACTION DIRECTIVE: Answer that no current order has been placed. Do not list missing internal fields.";
    }
    if (this.isSummaryRequest(lower) && !activeOrderState && !currentDetails?.flavors.length) {
      return "APPLICATION ORDER FACTS: There is no active order in the current conversation.\nNEXT ACTION DIRECTIVE: Tell the customer there is no active order summary available yet.";
    }
    if (activeOrderState?.flavors?.length) {
      return `APPLICATION ORDER FACTS:\n${this.formatOrderContext(activeOrderState)}\n\nNEXT ACTION DIRECTIVE:\n${this.buildNextActionDirective(message, activeOrderState)}\n\nCurrent message always wins.`;
    }
    if (currentDetails?.flavors?.length) {
      return `APPLICATION ORDER FACTS:\n${this.formatOrderContext(currentDetails)}\n\nNEXT ACTION DIRECTIVE:\n${this.buildNextActionDirective(message, currentDetails)}\n\nTreat this as the current request.`;
    }
    return recentMessages.length ? `CONVERSATION CONTEXT:\n${recentMessages.slice(-2).join("\n")}` : "CONVERSATION CONTEXT: none. Treat this as a fresh request.";
  }

  private hasCurrentOrderContext(recentMessages: string[]) {
    const customerMessages = recentMessages.filter((m) => /^Customer:/i.test(m)).map((m) => m.replace(/^Customer:\s*/i, "").trim());
    for (let i = customerMessages.length - 1; i >= 0; i--) {
      const text = customerMessages[i].toLowerCase();
      if (/^(hello|hi|hey|good morning|good afternoon|good evening)$/.test(text)) return false;
      if (/\b(order|pork|asado|bacon|ham|chicken|ube|mango|choco|chocolate|beef)\b|\b\d+\s*(?:pcs?|pieces?)\b|\b(same order|continue my order|place my order|change|remove|add|instead)\b|\b(maxim|pickup|pick up|gcash|cod|cash)\b/i.test(text)) return true;
    }
    return false;
  }

  private buildNextActionDirective(message: string, details: Details): string {
    const lower = message.toLowerCase().trim();
    if (this.isOrderStatusQuestion(lower)) return "Answer order status only. Do not expose internal validation field names.";
    if (this.isSummaryRequest(lower)) {
      return details.missingFields.length
        ? `Provide the current order summary first. Then mention only the customer-facing missing information: ${this.humanMissing(details.missingFields).join(", ")}. Do not ask for confirmation.`
        : "Provide the complete order summary. Then end exactly with: Please confirm if all the details above are correct. 😊";
    }
    if (/\b(total|total cost|how much is the total|how much total)\b/i.test(lower) && details.flavors.length) {
      const total = details.totalAmount ?? details.flavors.reduce((s, x) => s + (x.subtotal ?? x.quantity * (x.unitPrice ?? 0)), 0);
      return `Answer the total directly. Food total is ₱${total}. Do not ask for confirmation unless there are no missing required fields.`;
    }
    if (/\b(how long|how much time|delivery time|when will it arrive|when can it arrive|how soon)\b/i.test(lower)) return "Answer directly that preparation takes about 1 hour. Do not treat this as confirmation.";
    if (details.deliveryMethod === "maxim") {
      const deliveryMissing = details.missingFields.filter((f) => ["address", "landmark", "contactNumber"].includes(f));
      if (deliveryMissing.length) return `Ask explicitly for these missing Maxim delivery details first: ${this.humanMissing(deliveryMissing).join(", ")}. Do not ask for confirmation. If payment is missing too, collect these delivery details first.`;
    }
    if (details.missingFields.length) return `Ask only for the missing required information: ${this.humanMissing(details.missingFields).join(", ")}. Do not present confirmation.`;
    return "All required order fields are present. Present the complete order summary and end exactly with: Please confirm if all the details above are correct. 😊";
  }

  private formatOrderContext(details: Details): string {
    const total = details.totalAmount ?? details.flavors.reduce((s, x) => s + (x.subtotal ?? x.quantity * (x.unitPrice ?? 0)), 0);
    return [
      `Flavors: ${details.flavors.map((x) => `${x.quantity} pcs ${x.name} (₱${x.unitPrice ?? 0} each)`).join(", ")}`,
      `Quantity: ${details.quantity ?? details.flavors.reduce((s, x) => s + x.quantity, 0)}`,
      `Total food amount: ₱${total}`,
      `Delivery method: ${details.deliveryMethod ?? "missing"}`,
      `Payment method: ${details.paymentMethod ?? "missing"}`,
      `Address: ${details.address ?? "missing"}`,
      `Landmark: ${details.landmark ?? "missing"}`,
      `Contact #: ${details.contactNumber ?? "missing"}`,
      details.deliveryDate ? `Delivery date: ${details.deliveryDate}` : "",
      details.preferredTime ? `Preferred time: ${details.preferredTime}` : "",
      `Missing required information: ${details.missingFields.length ? this.humanMissing(details.missingFields).join(", ") : "none"}`,
      `Placement status: ${details.missingFields.length === 0 && details.flavors.length ? "READY only after explicit confirmation" : "NOT READY"}`
    ].filter(Boolean).join("\n");
  }

  private buildOrderDetails(message: string, activeOrderState?: Details): Details {
    const lower = message.toLowerCase().trim();
    const continuation = this.isContinuationMessage(lower) || Boolean(activeOrderState?.flavors?.length && this.isOrderFieldAnswer(lower));
    const parsed = this.parseCurrentMessage(message, activeOrderState, continuation);
    const base = continuation ? activeOrderState : undefined;
    const merged: Details = { ...(base ?? { flavors: [], missingFields: [], confirmed: false }), ...parsed, flavors: parsed.flavors.length ? parsed.flavors : (base?.flavors ?? []), missingFields: [] };
    if (continuation && this.isConfirmationMessage(lower) && base) merged.confirmed = true;
    else if (!this.isConfirmationMessage(lower)) merged.confirmed = false;
    if (base?.flavors?.length && !parsed.flavors.length && parsed.quantity && base.flavors.length === 1) {
      const existing = base.flavors[0]; const quantity = Number(parsed.quantity); const price = existing.unitPrice ?? PRICES[existing.name.toLowerCase()] ?? 0;
      merged.flavors = [{ name: existing.name, quantity, unitPrice: price, subtotal: quantity * price }]; merged.quantity = quantity;
    }
    merged.quantity = merged.flavors.length && merged.flavors.every((x) => x.quantity > 0) ? merged.flavors.reduce((s, x) => s + x.quantity, 0) : merged.quantity;
    merged.totalAmount = merged.flavors.length && merged.flavors.every((x) => x.quantity > 0) ? merged.flavors.reduce((s, x) => s + (x.subtotal ?? x.quantity * (x.unitPrice ?? 0)), 0) : merged.totalAmount;
    merged.missingFields = this.calculateMissingFields(merged);
    return merged;
  }

  private parseCurrentMessage(message: string, activeOrderState?: Details, continuation = false): Details {
    const lower = message.toLowerCase(); const details: Details = { flavors: [], missingFields: [], confirmed: false }; const quantities = new Map<string, number>();
    for (const flavor of FLAVOR_ALIASES) for (const alias of flavor.aliases) {
      const before = new RegExp(`\\b(\\d+)\\s*(?:pcs?|pieces?)\\s*(?:of\\s+)?${this.escapeRegExp(alias)}\\b`, "i").exec(message);
      const after = new RegExp(`\\b${this.escapeRegExp(alias)}\\b[^,;\\n]{0,30}?(\\d+)\\s*(?:pcs?|pieces?)\\b`, "i").exec(message);
      const quantity = before?.[1] ?? after?.[1]; if (quantity) { quantities.set(flavor.canonical, Number(quantity)); break; }
    }
    const quantityMatch = message.match(/\b(\d+)\s*(?:pcs?|pieces?)\b/i); if (quantityMatch) details.quantity = Number(quantityMatch[1]);
    for (const [name, quantity] of quantities) { const unitPrice = PRICES[name.toLowerCase()]; details.flavors.push({ name, quantity, unitPrice, subtotal: unitPrice * quantity }); }
    if (!details.flavors.length) {
      const matched = FLAVOR_ALIASES.find((f) => f.aliases.some((a) => new RegExp(`\\b${this.escapeRegExp(a)}\\b`, "i").test(lower)));
      if (matched) { const unitPrice = PRICES[matched.canonical.toLowerCase()]; const quantity = details.quantity ?? 0; details.flavors = [{ name: matched.canonical, quantity, unitPrice, ...(quantity > 0 ? { subtotal: quantity * unitPrice } : {}) }]; }
    }
    if (/\b(maxim|deliver|delivery)\b/i.test(lower)) details.deliveryMethod = "maxim";
    if (/\b(pickup|pick up|pick-up)\b/i.test(lower)) details.deliveryMethod = "pickup";
    if (/\bgcash\b/i.test(lower)) details.paymentMethod = "gcash";
    else if (/\b(cod|cash on delivery|cash)\b/i.test(lower)) details.paymentMethod = "cod";
    const phone = message.match(/(?:contact(?:\s*(?:number|#))?|phone(?:\s*number)?|cp|mobile)\s*[:\-]?\s*(\+?63\s*\d{10}|09\d{9})\b/i); if (phone) details.contactNumber = phone[1].replace(/\s+/g, "");
    const address = message.match(/(?:address)\s*[:\-]\s*(.*?)(?=\s+(?:landmark|contact(?:\s*(?:number|#))?|phone(?:\s*number)?|cp|mobile)\s*[:\-]|$)/i); if (address) details.address = address[1].trim();
    const landmark = message.match(/(?:landmark)\s*[:\-]\s*(.*?)(?=\s+(?:contact(?:\s*(?:number|#))?|phone(?:\s*number)?|cp|mobile)\s*[:\-]|$)/i); if (landmark) details.landmark = landmark[1].trim();
    if (continuation && activeOrderState) {
      const dateMatch = message.match(/\b(today|tomorrow|on\s+\w+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})\b/i);
      const timeMatch = message.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)|\d{1,2}\s*(?:AM|PM))\b/i);
      if (dateMatch) { const raw = dateMatch[1].trim(); details.deliveryDate = /^today$/i.test(raw) ? this.manilaDateOffset(0) : /^tomorrow$/i.test(raw) ? this.manilaDateOffset(1) : this.normalizeDateToken(raw); }
      if (timeMatch) details.preferredTime = timeMatch[1].replace(/\s+/g, " ").trim();
      details.deliveryMethod = details.deliveryMethod ?? activeOrderState.deliveryMethod; details.paymentMethod = details.paymentMethod ?? activeOrderState.paymentMethod; details.address = details.address ?? activeOrderState.address; details.landmark = details.landmark ?? activeOrderState.landmark; details.contactNumber = details.contactNumber ?? activeOrderState.contactNumber;
    }
    return details;
  }

  private calculateMissingFields(details: Details): string[] {
    const missing: string[] = []; const quantity = Number(details.quantity ?? 0); const flavorQuantity = details.flavors.reduce((s, x) => s + Number(x.quantity || 0), 0);
    if (!details.flavors.length) missing.push("flavors");
    if (!quantity || (details.flavors.length > 0 && flavorQuantity !== quantity)) missing.push("quantity");
    if (quantity > 0 && quantity < 10) missing.push("minimumOrder");
    if (!details.deliveryMethod) missing.push("deliveryMethod");
    if (!details.paymentMethod) missing.push("paymentMethod");
    if (details.deliveryMethod === "maxim") { if (!details.address?.trim()) missing.push("address"); if (!details.landmark?.trim()) missing.push("landmark"); if (!details.contactNumber?.trim()) missing.push("contactNumber"); }
    return [...new Set(missing)];
  }

  private humanMissing(fields: string[]) { return fields.map((f) => f === "deliveryMethod" ? "delivery method (Pickup or Maxim)" : f === "paymentMethod" ? "payment method (GCash or COD)" : f === "address" ? "Address" : f === "landmark" ? "Landmark" : f === "contactNumber" ? "Contact #" : f === "quantity" ? "quantity" : f === "flavors" ? "flavor" : f === "minimumOrder" ? "at least 10 pcs" : f); }
  private isSummaryRequest(lower: string) { return /\b(summary|summarize|summarize my order|send.*summary|show.*summary)\b/i.test(lower); }
  private isOrderStatusQuestion(lower: string) { return /\b(did you place my order|have you placed my order|was my order placed|is my order placed|order status|has my order been placed)\b/i.test(lower); }
  private isOrderFieldAnswer(lower: string) { return /^\d+\s*(?:pcs?|pieces?)$/i.test(lower) || /\b(pickup|pick up|maxim|gcash|cod|cash)\b/i.test(lower) || this.isConfirmationMessage(lower) || this.isSummaryRequest(lower) || /\b(address|landmark|contact(?:\s*(?:number|#))?|phone(?:\s*number)?|cp|mobile)\b/i.test(lower) || /\b(today|tomorrow)\b/i.test(lower) && /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(lower); }
  private isContinuationMessage(lower: string) { return this.isConfirmationMessage(lower) || this.isSummaryRequest(lower) || this.isOrderStatusQuestion(lower) || /\b(place my order|place the order|order it|change|remove|add|instead|same order|total|total cost|delivery date|delivery time|deliver|pickup date|pickup time)\b/i.test(lower) || /\b(pickup|pick up|maxim|gcash|cod|cash)\b/i.test(lower) || /\b(today|tomorrow)\b/i.test(lower) && /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(lower); }
  private isConfirmationMessage(lower: string) { return /^(yes|yeah|yep|yes that's correct|yes thats correct|that's correct|thats correct|correct|confirmed|confirm|go ahead|proceed|okay proceed|yes all are correct|yes all correct|all are correct|everything is correct|place my order|place the order|order it)$/i.test(lower.trim()) || /\b(place my order|place the order|order it)\b/i.test(lower.trim()); }
  private inferIntent(message: string, details: Details): CustomerIntent { const lower = message.toLowerCase(); if (this.isConfirmationMessage(lower)) return "order_confirmation"; if (/\b(delivery fee|df)\b/.test(lower)) return "delivery_request"; if (/\b(pickup|pick up)\b/.test(lower)) return "pickup_request"; if (/\b(hm|how much|price|pila|tagpila|presyo|total|total cost)\b/.test(lower) && !details.flavors.length) return "pricing_question"; if (details.flavors.length || /\border\b|\b\d+\s*(?:pcs?|pieces?)\b/.test(lower)) return "reservation"; return "inquiry"; }
  private manilaDateOffset(days: number) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const v = Object.fromEntries(parts.map((p) => [p.type, p.value])); const d = new Date(`${v.year}-${v.month}-${v.day}T00:00:00+08:00`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  private normalizeDateToken(value: string) { const cleaned = value.replace(/^on\s+/i, "").trim(); const parsed = new Date(cleaned); return Number.isNaN(parsed.getTime()) ? cleaned : parsed.toISOString().slice(0, 10); }
  private escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  private cleanReply(reply: string) { return reply.replace(/^```(?:text|json)?\s*/i, "").replace(/\s*```$/i, "").trim(); }
}
