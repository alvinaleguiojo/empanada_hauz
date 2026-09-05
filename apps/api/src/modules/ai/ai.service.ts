import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult } from "./types";

const EMPANADA_SYSTEM_PROMPT = `You are a customer support assistant for Empanada Hauz.
Keep replies short and clear. Use Cebuano when the customer uses Cebuano, otherwise English.
You answer EVERY customer message. Do not use application-side intent guesses to decide what to say. Read the customer's current message together with the conversation context and this system prompt, then decide the correct intent and write the customer-facing reply yourself.
Do not invent prices or order details. Minimum order is 10 pcs.

Prices:
- New Flavor Bacon with Cheese - ₱35
- Pork Regular - ₱20
- Pork Regular with Egg - ₱25
- Pork Asado - ₱30
- Ham & Cheese - ₱25
- Chicken - ₱20
- Chicken with Egg - ₱25
- Ube Empanada - ₱25
- Mango - ₱25
- Choco - ₱30
- Beef - ₱35
- Beef with Egg - ₱40
Best sellers: Pork Regular with Egg, Chicken with Egg, Beef with Egg.

Payment: GCash or Cash on Delivery (COD). GCash: Alvin Aleguiojo, 09453916796.
Pickup: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao. Maxim delivery is also available.
For Maxim delivery, collect Address, Landmark, and Contact #. Do not ask for a preferred delivery time.
Pickup orders only need a flavor, quantity, and payment method before confirmation.
Baked is ₱5 more than the original price. Mixed flavors are allowed. Preparation is approximately 1 hour.
Orders of 30 pcs or more get 20% off the delivery fee only, and only when the customer asks about a discount.
If a customer schedules an order, preserve the date and time in the summary; never invent a time.
Before confirmation, provide a concise bullet-point summary and end with: "Please confirm if all the details above are correct. 😊"
After the application successfully creates a confirmed order, the application will send the ready message. Never claim an order was created yourself.
If today is Sunday in Asia/Manila, tell customers the business is closed and do not create Sunday orders.
Never treat placeholder strings such as "none provided", "unknown", or "not available" as real customer information. Use null or omit missing values.
Return ONLY valid JSON matching the requested schema.`;

interface OllamaResponse { message?: { content?: string } }

type KnownOrderFacts = {
  product?: { name: string; price: number };
  quantity?: number;
  deliveryMethod?: "pickup" | "maxim";
  paymentMethod?: "cod" | "gcash";
  address?: string;
  landmark?: string;
  contactNumber?: string;
};

const PRODUCTS: Array<{ aliases: string[]; name: string; price: number }> = [
  { aliases: ["bacon with cheese", "bacon"], name: "New Flavor Bacon with Cheese", price: 35 },
  { aliases: ["pork regular with egg", "pork with egg", "pork egg"], name: "Pork Regular with Egg", price: 25 },
  { aliases: ["pork regular", "pork"], name: "Pork Regular", price: 20 },
  { aliases: ["pork asado", "asado"], name: "Pork Asado", price: 30 },
  { aliases: ["ham & cheese", "ham and cheese", "ham cheese"], name: "Ham & Cheese", price: 25 },
  { aliases: ["chicken with egg", "chicken egg"], name: "Chicken with Egg", price: 25 },
  { aliases: ["chicken"], name: "Chicken", price: 20 },
  { aliases: ["ube empanada", "ube"], name: "Ube Empanada", price: 25 },
  { aliases: ["mango"], name: "Mango", price: 25 },
  { aliases: ["choco", "chocolate"], name: "Choco", price: 30 },
  { aliases: ["beef with egg", "beef egg"], name: "Beef with Egg", price: 40 },
  { aliases: ["beef"], name: "Beef", price: 35 }
];

const OLLAMA_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "confidence", "details", "suggestedReply"],
  properties: {
    intent: {
      type: "string",
      enum: ["inquiry", "order_confirmation", "reservation", "delivery_request", "pickup_request", "pricing_question"]
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    details: {
      type: "object",
      additionalProperties: false,
      properties: {
        quantity: { type: ["number", "null"] },
        location: { type: ["string", "null"] },
        deliveryMethod: { anyOf: [{ type: "string", enum: ["pickup", "maxim"] }, { type: "null" }] },
        preferredTime: { type: ["string", "null"] },
        deliveryDate: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
        landmark: { type: ["string", "null"] },
        contactNumber: { type: ["string", "null"] },
        paymentMethod: { anyOf: [{ type: "string", enum: ["cod", "gcash"] }, { type: "null" }] },
        flavors: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "quantity"],
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: ["number", "null"] },
              subtotal: { type: ["number", "null"] }
            }
          }
        },
        totalAmount: { type: ["number", "null"] },
        confirmed: { type: "boolean" },
        missingFields: { type: "array", items: { type: "string" } }
      }
    },
    suggestedReply: { type: "string" }
  }
};

const OLLAMA_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } }
};

@Injectable()
export class AiService {
  protected readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:8b");
  }

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[] }): Promise<AIIntentResult> {
    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const systemPrompt = EMPANADA_SYSTEM_PROMPT.replace("{{CURRENT_DATE_TIME}}", now).replaceAll("{{Customer's Name}}", context?.customerName ?? "Customer");
    const recentMessages = (context?.recentMessages ?? []).slice(-12);
    const conversationContext = recentMessages.length ? `\nRecent conversation:\n${recentMessages.join("\n")}` : "";
    const knownFacts = this.buildKnownFacts(message, recentMessages);

    this.logger.log(`AI path=OLLAMA model=${this.model} message=${JSON.stringify(message)}`);
    let result: AIIntentResult;
    try {
      result = await this.callOllama({ systemPrompt, conversationContext, knownFacts, message });
    } catch (error) {
      this.logger.warn(`AI path=OLLAMA_STRUCTURED_FAILED reason=${String(error)}`);
      result = await this.callOllamaReplyRecovery({ systemPrompt, conversationContext, knownFacts, message });
    }

    const corrected = this.applyKnownFacts(result, message, recentMessages);
    if (this.shouldRewriteReply(corrected) || !corrected.suggestedReply?.trim()) {
      const rewritten = await this.generateCustomerReply({ systemPrompt, conversationContext, knownFacts, message, result: corrected });
      if (rewritten) corrected.suggestedReply = rewritten;
    }
    if (!corrected.suggestedReply?.trim()) throw new Error("Ollama did not return a usable customer reply");
    this.logger.log(`AI path=OLLAMA_SUCCESS confidence=${corrected.confidence} intent=${corrected.intent}`);
    return { ...corrected, source: "ollama" };
  }

  private async callOllama(input: { systemPrompt: string; conversationContext: string; knownFacts: string; message: string }): Promise<AIIntentResult> {
    const body = {
      model: this.model,
      stream: false,
      format: OLLAMA_RESULT_SCHEMA,
      think: false,
      options: { temperature: 0.1, num_predict: 768, num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: `${input.systemPrompt}\n\nYou are the only customer-facing AI. Every customer message must be answered by you. Do not rely on a hard-coded application intent classifier. Use the customer's current message, recent conversation, and the system prompt to understand the request. The application may validate structured order data after you respond, but it must not replace your customer-facing answer.\n\nReturn exactly one JSON object matching the response schema. Keep suggestedReply short.`
        },
        { role: "user", content: `${input.conversationContext}\nCurrent application facts for order validation only:\n${input.knownFacts}\nCustomer message:\n${input.message}` }
      ]
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
      const bodyJson = await response.json() as OllamaResponse;
      const content = bodyJson.message?.content?.trim();
      if (!content) throw new Error("Ollama returned an empty response");
      return this.normalizeResult(this.parseStructuredJson(content) as AIIntentResult);
    } finally { clearTimeout(timeout); }
  }

  private async callOllamaRetry(input: { systemPrompt: string; conversationContext: string; knownFacts: string; message: string }): Promise<AIIntentResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: OLLAMA_RESULT_SCHEMA,
          think: false,
          options: { temperature: 0, num_predict: 640, num_ctx: 3072 },
          messages: [
            {
              role: "system",
              content: `${input.systemPrompt}\n\nReturn exactly ONE compact JSON object matching the response schema. Always include a short customer-facing suggestedReply. You are the customer-facing AI for every message. Do not use a hard-coded application intent classifier.`
            },
            { role: "user", content: `${input.conversationContext}\nOrder-validation facts only:\n${input.knownFacts}\nCustomer message:\n${input.message}` }
          ]
        })
      });
      if (!response.ok) throw new Error(`Ollama retry failed: ${response.status} ${await response.text()}`);
      const body = await response.json() as OllamaResponse;
      const content = body.message?.content?.trim();
      if (!content) throw new Error("Ollama retry returned an empty response");
      return this.normalizeResult(this.parseStructuredJson(content) as AIIntentResult);
    } finally { clearTimeout(timeout); }
  }

  private async callOllamaReplyRecovery(input: { systemPrompt: string; conversationContext: string; knownFacts: string; message: string }): Promise<AIIntentResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: OLLAMA_REPLY_SCHEMA,
          think: false,
          options: { temperature: 0.1, num_predict: 192, num_ctx: 3072 },
          messages: [
            {
              role: "system",
              content: `${input.systemPrompt}\n\nThe structured extraction was invalid. Do NOT discuss this. Answer the customer's current message directly. Return only JSON matching this schema with a single short "reply" string.\n\nDo not let stale conversation/order data override an unrelated current question.`
            },
            { role: "user", content: `${input.conversationContext}\nOrder-validation facts only:\n${input.knownFacts}\nCustomer message:\n${input.message}` }
          ]
        })
      });
      if (!response.ok) throw new Error(`Ollama reply recovery failed: ${response.status} ${await response.text()}`);
      const body = await response.json() as OllamaResponse;
      const content = body.message?.content?.trim();
      if (!content) throw new Error("Ollama reply recovery returned an empty response");
      const parsed = this.parseStructuredJson(content) as { reply?: string };
      if (!parsed.reply?.trim()) throw new Error("Ollama reply recovery returned no reply");
      return this.normalizeResult({
        intent: "inquiry",
        confidence: 0,
        details: { flavors: [], missingFields: [], confirmed: false },
        suggestedReply: parsed.reply.trim()
      } as AIIntentResult);
    } finally { clearTimeout(timeout); }
  }

  private async generateCustomerReply(input: { systemPrompt: string; conversationContext: string; knownFacts: string; message: string; result: AIIntentResult }): Promise<string> {
    const details = input.result.details;
    const prompt = [
      input.systemPrompt,
      "You are writing the final customer-facing response for EVERY current customer message.",
      "Answer the customer's actual question first. Do not let stale order facts override an unrelated current question.",
      "Return exactly one JSON object matching the reply schema.",
      "Use the recent conversation only when it is relevant to the customer's current message.",
      "For order execution, follow the validated details and never claim an order was created unless the application has successfully created it.",
      `Validated order details: ${JSON.stringify(details)}`,
      `Recent conversation: ${input.conversationContext}`,
      `Customer message: ${input.message}`,
      `Original Qwen response: ${input.result.suggestedReply || "(empty)"}`
    ].join("\n\n");
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ model: this.model, stream: false, format: OLLAMA_REPLY_SCHEMA, think: false, options: { temperature: 0.1, num_predict: 192, num_ctx: 3072 }, messages: [{ role: "system", content: prompt }, { role: "user", content: input.message }] })
    });
    if (!response.ok) throw new Error(`Ollama reply rewrite failed: ${response.status} ${await response.text()}`);
    const body = await response.json() as OllamaResponse;
    const content = body.message?.content?.trim();
    if (!content) throw new Error("Ollama reply rewrite returned an empty response");
    const parsed = this.parseStructuredJson(content) as { reply?: string };
    if (!parsed.reply?.trim()) throw new Error("Ollama reply rewrite returned no reply");
    return parsed.reply.trim();
  }

  private parseStructuredJson(content: string): unknown {
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try { return JSON.parse(cleaned); }
    catch {
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
      throw new SyntaxError("Ollama returned invalid JSON");
    }
  }

  private isOrderRelatedMessage(message: string) {
    const lower = message.toLowerCase();
    return Boolean(
      this.findProduct(lower) ||
      this.extractQuantity(lower) ||
      this.extractDeliveryMethod(lower) ||
      this.extractPaymentMethod(lower) ||
      /\b(order|orders|ordering|confirm|confirmed|proceed|place|deliver|delivery|pickup|pick up|address|landmark|contact|schedule|scheduled|pcs?|pieces?|buy|get)\b/i.test(lower)
    );
  }

  private buildKnownFacts(message: string, recentMessages: string[]) {
    const current = this.extractFacts(message);
    const historical = this.isOrderRelatedMessage(message) ? this.extractHistoricalFacts(recentMessages) : {};
    const product = current.product ?? historical.product;
    const quantity = current.quantity ?? historical.quantity;
    const deliveryMethod = current.deliveryMethod ?? historical.deliveryMethod;
    const paymentMethod = current.paymentMethod ?? historical.paymentMethod;
    const address = this.cleanText(current.address ?? historical.address);
    const landmark = this.cleanText(current.landmark ?? historical.landmark);
    const contactNumber = this.cleanText(current.contactNumber ?? historical.contactNumber);
    const missing = this.requiredMissingFromFacts({ product, quantity, deliveryMethod, paymentMethod, address, landmark, contactNumber });
    return [
      product ? `Product: ${product.name} at ₱${product.price}.` : "Product: none provided.",
      quantity ? `Quantity: ${quantity}.` : "Quantity: none provided.",
      deliveryMethod ? `Delivery method: ${deliveryMethod}.` : "Delivery method: none provided.",
      paymentMethod ? `Payment method: ${paymentMethod}.` : "Payment method: none provided.",
      address ? `Address: ${address}.` : "Address: none provided.",
      landmark ? `Landmark: ${landmark}.` : "Landmark: none provided.",
      contactNumber ? `Contact #: ${contactNumber}.` : "Contact #: none provided.",
      product && quantity ? `Validated product total before delivery fee: ₱${product.price * quantity}.` : "Validated total: unavailable.",
      missing.length ? `Required missing fields: ${missing.join(", ")}.` : "Required missing fields: none."
    ].join("\n");
  }

  private extractHistoricalFacts(recentMessages: string[]): KnownOrderFacts {
    const facts: KnownOrderFacts = {};
    for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
      const line = recentMessages[i];
      if (!/^Customer:/i.test(line)) continue;
      const extracted = this.extractFacts(line.replace(/^Customer:\s*/i, ""));
      if (!facts.product && extracted.product) facts.product = extracted.product;
      if (!facts.quantity && extracted.quantity) facts.quantity = extracted.quantity;
      if (!facts.deliveryMethod && extracted.deliveryMethod) facts.deliveryMethod = extracted.deliveryMethod;
      if (!facts.paymentMethod && extracted.paymentMethod) facts.paymentMethod = extracted.paymentMethod;
      if (!facts.address && extracted.address) facts.address = extracted.address;
      if (!facts.landmark && extracted.landmark) facts.landmark = extracted.landmark;
      if (!facts.contactNumber && extracted.contactNumber) facts.contactNumber = extracted.contactNumber;
    }
    return facts;
  }

  private extractFacts(text: string): KnownOrderFacts {
    const lower = text.toLowerCase().trim();
    return {
      product: this.findProduct(lower), quantity: this.extractQuantity(lower), deliveryMethod: this.extractDeliveryMethod(lower),
      paymentMethod: this.extractPaymentMethod(lower),
      address: this.extractField(lower, /address[:\s]+(.+?)(?:\s+landmark[:\s]+|\s+contact(?:\s*#| number)?[:\s]+|$)/i),
      landmark: this.extractField(lower, /landmark[:\s]+(.+?)(?:\s+contact(?:\s*#| number)?[:\s]+|$)/i),
      contactNumber: this.extractField(lower, /contact(?:\s*#| number)?[:\s]+([+\d][\d\s-]{6,})/i)
    };
  }

  private applyKnownFacts(result: AIIntentResult, message: string, recentMessages: string[]): AIIntentResult {
    const current = this.extractFacts(message);
    const historical = this.isOrderRelatedMessage(message) ? this.extractHistoricalFacts(recentMessages) : {};
    const details = {
      ...(result.details ?? { missingFields: [] }),
      missingFields: Array.isArray(result.details?.missingFields) ? [...result.details.missingFields] : [],
      flavors: Array.isArray(result.details?.flavors) ? [...result.details.flavors] : []
    };
    const product = current.product ?? historical.product;
    const quantity = current.quantity ?? historical.quantity;
    const deliveryMethod = current.deliveryMethod ?? historical.deliveryMethod;
    const paymentMethod = current.paymentMethod ?? historical.paymentMethod;
    const address = this.cleanText(current.address ?? historical.address);
    const landmark = this.cleanText(current.landmark ?? historical.landmark);
    const contactNumber = this.cleanText(current.contactNumber ?? historical.contactNumber);
    if (product && quantity) {
      details.flavors = [{ name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity }];
      details.quantity = quantity;
      details.totalAmount = product.price * quantity;
    }
    if (deliveryMethod) details.deliveryMethod = deliveryMethod;
    if (paymentMethod) details.paymentMethod = paymentMethod;
    if (address) details.address = address; else delete details.address;
    if (landmark) details.landmark = landmark; else delete details.landmark;
    if (contactNumber) details.contactNumber = contactNumber; else delete details.contactNumber;
    details.deliveryMethod = this.normalizeDeliveryMethod(details.deliveryMethod);
    details.paymentMethod = this.normalizePaymentMethod(details.paymentMethod);
    details.location = this.cleanText(details.location);
    const complete = this.hasCompleteOrder(details);
    details.missingFields = complete ? [] : this.requiredMissingFields(details);
    details.confirmed = complete && this.isExplicitConfirmation(message);
    return this.normalizeResult({ ...result, details });
  }

  private hasCompleteOrder(details: AIIntentResult["details"]) {
    const flavors = details.flavors ?? [];
    const quantity = Number(details.quantity ?? 0);
    const deliveryComplete = details.deliveryMethod === "pickup" || (details.deliveryMethod === "maxim" && Boolean(this.cleanText(details.address) && this.cleanText(details.landmark) && this.cleanText(details.contactNumber)));
    const paymentComplete = details.paymentMethod === "cod" || details.paymentMethod === "gcash";
    return flavors.length > 0 && quantity >= 10 && paymentComplete && Boolean(details.deliveryMethod) && deliveryComplete;
  }

  private requiredMissingFields(details: AIIntentResult["details"]) {
    const missing: string[] = [];
    if (!details.flavors?.length) missing.push("flavors");
    if (Number(details.quantity ?? 0) < 10) missing.push("quantity");
    if (!details.deliveryMethod) missing.push("deliveryMethod");
    if (!details.paymentMethod) missing.push("paymentMethod");
    if (details.deliveryMethod === "maxim") {
      if (!this.cleanText(details.address)) missing.push("address");
      if (!this.cleanText(details.landmark)) missing.push("landmark");
      if (!this.cleanText(details.contactNumber)) missing.push("contactNumber");
    }
    return missing;
  }

  private requiredMissingFromFacts(facts: KnownOrderFacts) {
    const missing: string[] = [];
    if (!facts.product) missing.push("flavors");
    if (!facts.quantity || facts.quantity < 10) missing.push("quantity");
    if (!facts.deliveryMethod) missing.push("deliveryMethod");
    if (!facts.paymentMethod) missing.push("paymentMethod");
    if (facts.deliveryMethod === "maxim") {
      if (!this.cleanText(facts.address)) missing.push("address");
      if (!this.cleanText(facts.landmark)) missing.push("landmark");
      if (!this.cleanText(facts.contactNumber)) missing.push("contactNumber");
    }
    return missing;
  }

  private isExplicitConfirmation(message: string) {
    return /\b(yes|correct|confirmed|confirm|go ahead|place my order|place the order|order it|that's correct|that is correct|okay proceed|proceed)\b/i.test(message);
  }

  private shouldRewriteReply(result: AIIntentResult) {
    const details = result.details;
    return Boolean(details.flavors?.length || details.quantity || details.deliveryMethod || details.paymentMethod || details.confirmed);
  }

  private findProduct(text: string) {
    return PRODUCTS.find((product) => product.aliases.some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(text)));
  }

  private extractQuantity(text: string) {
    const match = text.match(/\b(\d+)\s*(?:pcs?|pieces?)?\b/i);
    return match ? Number(match[1]) : undefined;
  }

  private extractDeliveryMethod(text: string): "pickup" | "maxim" | undefined {
    if (/\b(pick ?up|pick-up)\b/i.test(text)) return "pickup";
    if (/\b(maxim|deliver|delivery)\b/i.test(text)) return "maxim";
    return undefined;
  }

  private extractPaymentMethod(text: string): "cod" | "gcash" | undefined {
    if (/\b(gcash|g cash)\b/i.test(text)) return "gcash";
    if (/\b(cod|cash on delivery|cash)\b/i.test(text)) return "cod";
    return undefined;
  }

  private extractField(text: string, pattern: RegExp) { return this.cleanText(text.match(pattern)?.[1]); }

  private cleanText(value?: unknown) {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (/^(?:none|none provided|not provided|unknown|n\/a|na|null|undefined|not available)$/i.test(normalized)) return undefined;
    return normalized;
  }

  private normalizeDeliveryMethod(value: unknown): "pickup" | "maxim" | undefined { return value === "pickup" || value === "maxim" ? value : undefined; }
  private normalizePaymentMethod(value: unknown): "cod" | "gcash" | undefined { return value === "cod" || value === "gcash" ? value : undefined; }

  private normalizeResult(result: AIIntentResult): AIIntentResult {
    const details = result.details ?? { missingFields: [] };
    details.missingFields = Array.isArray(details.missingFields) ? details.missingFields : [];
    details.flavors = Array.isArray(details.flavors) ? details.flavors : [];
    details.deliveryMethod = this.normalizeDeliveryMethod(details.deliveryMethod);
    details.paymentMethod = this.normalizePaymentMethod(details.paymentMethod);
    details.location = this.cleanText(details.location);
    details.address = this.cleanText(details.address);
    details.landmark = this.cleanText(details.landmark);
    details.contactNumber = this.cleanText(details.contactNumber);
    result.confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
    if (!result.intent) result.intent = "inquiry";
    result.suggestedReply = result.suggestedReply?.trim() ?? "";
    if (!details.quantity && details.flavors.length) details.quantity = details.flavors.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    result.details = details;
    return result;
  }
}
