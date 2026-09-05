import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult } from "./types";

const EMPANADA_SYSTEM_PROMPT = `You are a customer support assistant for Empanada Hauz.
Keep replies short and clear. Use Cebuano when the customer uses Cebuano, otherwise English.
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
Return ONLY valid JSON matching the requested schema.`;

interface OllamaResponse { message?: { content?: string } }

type Flavor = { name: string; quantity: number; unitPrice?: number; subtotal?: number };

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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:8b");
  }

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[] }): Promise<AIIntentResult> {
    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const systemPrompt = EMPANADA_SYSTEM_PROMPT
      .replace("{{CURRENT_DATE_TIME}}", now)
      .replaceAll("{{Customer's Name}}", context?.customerName ?? "Customer");
    const recentMessages = (context?.recentMessages ?? []).slice(-12);
    const conversationContext = recentMessages.length ? `\nRecent conversation:\n${recentMessages.join("\n")}` : "";
    const knownFacts = this.buildKnownFacts(message, recentMessages);
    const schema = {
      intent: "inquiry | order_confirmation | reservation | delivery_request | pickup_request | pricing_question",
      confidence: "number from 0 to 1",
      details: {
        quantity: "number or null", location: "string or null", deliveryMethod: "pickup | maxim | null",
        preferredTime: "string or null", deliveryDate: "YYYY-MM-DD or null", address: "string or null",
        landmark: "string or null", contactNumber: "string or null", paymentMethod: "cod | gcash | null",
        flavors: "array of {name, quantity, unitPrice, subtotal} or []", totalAmount: "number or null",
        confirmed: "boolean", missingFields: "array of strings"
      },
      suggestedReply: "short customer-facing reply string"
    };

    this.logger.log(`AI path=OLLAMA model=${this.model} message=${JSON.stringify(message)}`);
    try {
      const result = await this.callOllama({ systemPrompt, schema, conversationContext, knownFacts, message });
      const corrected = this.applyKnownFacts(result, message, recentMessages);
      if (this.shouldRewriteReply(message, corrected)) {
        const rewritten = await this.generateCustomerReply({ systemPrompt, conversationContext, knownFacts, message, result: corrected });
        if (rewritten) corrected.suggestedReply = rewritten;
      }
      this.logger.log(`AI path=OLLAMA_SUCCESS confidence=${corrected.confidence} intent=${corrected.intent}`);
      return { ...corrected, source: "ollama" };
    } catch (error) {
      this.logger.warn(`AI path=FALLBACK reason=${String(error)} message=${JSON.stringify(message)}`);
      return { ...this.fallbackParse(message), source: "fallback" };
    }
  }

  private async callOllama(input: { systemPrompt: string; schema: object; conversationContext: string; knownFacts: string; message: string }): Promise<AIIntentResult> {
    const body = {
      model: this.model, stream: false, format: "json", think: false,
      options: { temperature: 0.1, num_predict: 512, num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: `${input.systemPrompt}\n\nYOU are the customer-facing AI. Always generate suggestedReply yourself. Use the recent conversation and application facts to maintain context. Application facts are authoritative for known product names, prices, quantities, delivery method, payment method, and supplied customer details. Never invent missing information. Never mark an order confirmed when required fields are missing. "Place my order" is only a confirmation request; the application decides whether the order is complete and eligible for creation. Never claim an order was created unless the application says it was created. Never use placeholder strings such as "none provided" as actual order values; use null or omit the field when information is missing.\n\nJSON schema:\n${JSON.stringify(input.schema)}`
        },
        { role: "user", content: `${input.conversationContext}\nAuthoritative application facts:\n${input.knownFacts}\nCustomer message:\n${input.message}` }
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
      return this.normalizeResult(JSON.parse(content) as AIIntentResult);
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && /JSON/i.test(error.message))) {
        this.logger.warn(`AI path=OLLAMA_RETRY reason=${String(error)}`);
        return this.callOllamaRetry(input);
      }
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private async callOllamaRetry(input: { systemPrompt: string; schema: object; conversationContext: string; knownFacts: string; message: string }): Promise<AIIntentResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          model: this.model, stream: false, format: "json", think: false,
          options: { temperature: 0, num_predict: 384, num_ctx: 3072 },
          messages: [
            { role: "system", content: `${input.systemPrompt}\n\nReturn ONE compact JSON object only. Always write a short customer-facing suggestedReply. Treat application facts as authoritative. Never invent missing information and never mark incomplete orders confirmed. Never use placeholder strings such as "none provided" as actual order values; use null or omit missing fields. JSON schema:\n${JSON.stringify(input.schema)}` },
            { role: "user", content: `${input.conversationContext}\nApplication facts:\n${input.knownFacts}\nCustomer message:\n${input.message}` }
          ]
        })
      });
      if (!response.ok) throw new Error(`Ollama retry failed: ${response.status} ${await response.text()}`);
      const body = await response.json() as OllamaResponse;
      const content = body.message?.content?.trim();
      if (!content) throw new Error("Ollama retry returned an empty response");
      return this.normalizeResult(JSON.parse(content) as AIIntentResult);
    } finally { clearTimeout(timeout); }
  }

  private async generateCustomerReply(input: { systemPrompt: string; conversationContext: string; knownFacts: string; message: string; result: AIIntentResult }): Promise<string | null> {
    const details = input.result.details;
    const total = Number(details.totalAmount ?? 0);
    const incomplete = !this.hasCompleteOrder(details);
    const prompt = [
      input.systemPrompt,
      "You are now writing ONLY the final customer-facing reply for the current turn.",
      "Do not output JSON, labels, analysis, or a canned fallback.",
      "Use the authoritative order facts below. Never ask for information that is already present.",
      incomplete ? "The order is NOT complete. Do not ask for confirmation and do not say the order was placed. Ask only for the missing required details." : "The order is complete only if the application facts say so.",
      this.isTotalQuestion(input.message) && total > 0 ? `The customer asked for the total. Answer directly: ₱${total}.` : "",
      `Validated details: ${JSON.stringify(details)}`,
      `Recent conversation: ${input.conversationContext}`,
      `Customer message: ${input.message}`,
      `Original AI interpretation: ${input.result.suggestedReply}`
    ].filter(Boolean).join("\n\n");
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ model: this.model, stream: false, format: "json", think: false, options: { temperature: 0.1, num_predict: 160, num_ctx: 3072 }, messages: [{ role: "system", content: prompt }, { role: "user", content: input.message }] })
      });
      if (!response.ok) throw new Error(`Ollama reply rewrite failed: ${response.status} ${await response.text()}`);
      const body = await response.json() as OllamaResponse;
      const content = body.message?.content?.trim();
      if (!content) return null;
      const parsed = JSON.parse(content) as { reply?: string };
      return parsed.reply?.trim() || null;
    } catch (error) {
      this.logger.warn(`AI path=OLLAMA_REPLY_REWRITE_FAILED reason=${String(error)}`);
      return null;
    }
  }

  private buildKnownFacts(message: string, recentMessages: string[]) {
    const current = this.extractFacts(message);
    const historical = this.extractHistoricalFacts(recentMessages);
    const product = current.product ?? historical.product;
    const quantity = current.quantity ?? historical.quantity;
    const deliveryMethod = current.deliveryMethod ?? historical.deliveryMethod;
    const paymentMethod = current.paymentMethod ?? historical.paymentMethod;
    const address = current.address ?? historical.address;
    const landmark = current.landmark ?? historical.landmark;
    const contactNumber = current.contactNumber ?? historical.contactNumber;
    const missing = this.requiredMissingFromFacts({ product, quantity, deliveryMethod, paymentMethod, address, landmark, contactNumber });
    const facts = [
      product ? `Product: ${product.name} at ₱${product.price}.` : "Product: none provided.",
      quantity ? `Quantity: ${quantity}.` : "Quantity: none provided.",
      deliveryMethod ? `Delivery method: ${deliveryMethod}.` : "Delivery method: none provided.",
      paymentMethod ? `Payment method: ${paymentMethod}.` : "Payment method: none provided.",
      address ? `Address: ${address}.` : "Address: none provided.",
      landmark ? `Landmark: ${landmark}.` : "Landmark: none provided.",
      contactNumber ? `Contact #: ${contactNumber}.` : "Contact #: none provided.",
      product && quantity ? `Calculated product subtotal/total before delivery fee: ₱${product.price * quantity}.` : "Calculated total: unavailable.",
      missing.length ? `Required missing fields: ${missing.join(", ")}.` : "Required missing fields: none."
    ];
    return facts.join("\n");
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
    const historical = this.extractHistoricalFacts(recentMessages);
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
    if (address) details.address = address;
    else delete details.address;
    if (landmark) details.landmark = landmark;
    else delete details.landmark;
    if (contactNumber) details.contactNumber = contactNumber;
    else delete details.contactNumber;

    details.deliveryMethod = this.normalizeDeliveryMethod(details.deliveryMethod);
    details.paymentMethod = this.normalizePaymentMethod(details.paymentMethod);
    details.location = this.cleanText(details.location);

    const complete = this.hasCompleteOrder(details);
    const explicitConfirmation = this.isExplicitConfirmation(message);
    details.missingFields = complete ? [] : this.requiredMissingFields(details);
    details.confirmed = complete && explicitConfirmation;

    const intent = details.confirmed
      ? "order_confirmation"
      : details.deliveryMethod === "maxim"
        ? "delivery_request"
        : details.deliveryMethod === "pickup"
          ? "pickup_request"
          : this.isTotalQuestion(message)
            ? "pricing_question"
            : result.intent;

    return this.normalizeResult({ ...result, intent, details });
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

  private isTotalQuestion(message: string) {
    return /\b(how much is the total|what(?:'s| is) the total|total\??|how much altogether|how much all|pila tanan|tagpila tanan)\b/i.test(message);
  }

  private shouldRewriteReply(message: string, result: AIIntentResult) {
    const details = result.details;
    const complete = this.hasCompleteOrder(details);
    const confirmationRequest = this.isExplicitConfirmation(message);
    const hasOrderState = Boolean(details.flavors?.length || details.quantity || details.deliveryMethod || details.paymentMethod);
    return this.isTotalQuestion(message) ||
      hasOrderState ||
      (!complete && (confirmationRequest || result.intent === "order_confirmation" || details.confirmed === true)) ||
      (!complete && /please confirm if all the details above are correct/i.test(result.suggestedReply ?? ""));
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

  private extractField(text: string, pattern: RegExp) {
    const match = text.match(pattern);
    return this.cleanText(match?.[1]);
  }

  private cleanText(value?: unknown) {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (/^(?:none|none provided|not provided|unknown|n\/a|na|null|undefined|not available)$/i.test(normalized)) return undefined;
    return normalized;
  }

  private normalizeDeliveryMethod(value: unknown): "pickup" | "maxim" | undefined {
    if (value === "pickup" || value === "maxim") return value;
    return undefined;
  }

  private normalizePaymentMethod(value: unknown): "cod" | "gcash" | undefined {
    if (value === "cod" || value === "gcash") return value;
    return undefined;
  }

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
    if (!result.suggestedReply?.trim()) throw new Error("Ollama returned no suggestedReply");
    if (!details.quantity && details.flavors.length) details.quantity = details.flavors.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    result.details = details;
    return result;
  }

  private fallbackParse(message: string): AIIntentResult {
    const lower = message.toLowerCase();
    const deliveryMethod = this.extractDeliveryMethod(lower);
    const quantity = this.extractQuantity(lower);
    const product = this.findProduct(lower);
    const intent = /\b(price|hm|how much|pila|tagpila|presyo)\b/.test(lower) ? "pricing_question" : deliveryMethod === "pickup" ? "pickup_request" : deliveryMethod === "maxim" ? "delivery_request" : "inquiry";
    return {
      intent,
      confidence: 0.5,
      details: { quantity, deliveryMethod, missingFields: product ? [] : ["flavors"], flavors: product && quantity ? [{ name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity }] : [] },
      suggestedReply: product && quantity ? `I can help with that. Would you like pickup or Maxim delivery? 😊` : "Sure! 😊 What would you like to order?"
    };
  }
}
