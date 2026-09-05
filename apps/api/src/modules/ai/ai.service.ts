import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult } from "./types";

const EMPANADA_SYSTEM_PROMPT = `You are a customer support assistant for Empanada Hauz.
Keep replies short and clear. Use Cebuano when the customer uses Cebuano, otherwise English.
You answer EVERY customer message.

Read the customer's current message together with the recent conversation and these business rules, then decide the correct intent, extract any order details, and write the customer-facing reply yourself.

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

Important conversation behavior:
- Answer the customer's actual current question first.
- Do not assume that every customer message is an order confirmation.
- A flavor request is not a confirmation.
- A quantity is not a confirmation.
- "confirm" is confirmation only when the customer has already supplied all required order details.
- Remember relevant details from the recent conversation when the customer is continuing an order.
- Mixed flavors are allowed and should be handled naturally.

Return ONLY valid JSON matching the requested schema.`;

interface OllamaResponse { message?: { content?: string } }

type KnownOrderFacts = {
  product?: { name: string; price: number };
  quantity?: number;
  deliveryMethod?: "pickup" | "maxim";
  paymentMethod?: "cod" | "gcash";
};

const PRODUCTS: Array<{ aliases: string[]; name: string; price: number }> = [
  { aliases: ["bacon with cheese", "bacon"], name: "New Flavor Bacon with Cheese", price: 35 },
  { aliases: ["pork regular with egg", "pork with egg", "pork egg"], name: "Pork Regular with Egg", price: 25 },
  { aliases: ["pork regular", "pork"], name: "Pork Regular", price: 20 },
  { aliases: ["pork asado", "asado"], name: "Pork Asado", price: 30 },
  { aliases: ["ham & cheese", "ham and cheese", "ham cheese", "ham"], name: "Ham & Cheese", price: 25 },
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
      required: ["flavors", "missingFields", "confirmed"],
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
    const systemPrompt = EMPANADA_SYSTEM_PROMPT.replace("{{CURRENT_DATE_TIME}}", now).replaceAll("{{Customer's Name}}", context?.customerName ?? "Customer");
    const recentMessages = (context?.recentMessages ?? []).slice(-12);
    const conversationContext = recentMessages.length ? `Recent conversation:\n${recentMessages.join("\n")}` : "(no previous conversation)";

    this.logger.log(`AI path=OLLAMA model=${this.model} message=${JSON.stringify(message)}`);
    const result = await this.callOllama({ systemPrompt, conversationContext, message });
    const normalized = this.normalizeResult(result);
    if (!normalized.suggestedReply) throw new Error("Ollama did not return a customer-facing reply");
    this.logger.log(`AI path=OLLAMA_SUCCESS confidence=${normalized.confidence} intent=${normalized.intent}`);
    return { ...normalized, source: "ollama" };
  }

  private async callOllama(input: { systemPrompt: string; conversationContext: string; message: string }): Promise<AIIntentResult> {
    const body = {
      model: this.model,
      stream: false,
      format: OLLAMA_RESULT_SCHEMA,
      think: false,
      options: { temperature: 0.2, num_predict: 768, num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: `${input.systemPrompt}\n\nYou are the sole customer-facing AI. Decide what the customer is asking and write the answer yourself from the business rules and conversation context. Do not ask the application how to reply. Do not use an external classifier. Do not output a generic order template when the customer is asking a normal product or pricing question.\n\nReturn one JSON object matching the schema.`
        },
        {
          role: "user",
          content: `Customer context:\n${input.conversationContext}\n\nCurrent customer message:\n${input.message}`
        }
      ]
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
      const bodyJson = await response.json() as OllamaResponse;
      const content = bodyJson.message?.content?.trim();
      if (!content) throw new Error("Ollama returned an empty response");
      return this.normalizeResult(this.parseStructuredJson(content) as AIIntentResult);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseStructuredJson(content: string): unknown {
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
      throw new SyntaxError("Ollama returned invalid JSON");
    }
  }

  private normalizeResult(result: AIIntentResult): AIIntentResult {
    const details = result?.details ?? { flavors: [], missingFields: [], confirmed: false };
    return {
      intent: result?.intent ?? "inquiry",
      confidence: typeof result?.confidence === "number" ? result.confidence : 0,
      details: {
        ...details,
        flavors: Array.isArray(details.flavors) ? details.flavors : [],
        missingFields: Array.isArray(details.missingFields) ? details.missingFields : [],
        confirmed: details.confirmed === true
      },
      suggestedReply: typeof result?.suggestedReply === "string" ? result.suggestedReply.trim() : ""
    };
  }

  /** Structured validation for MCP execution only. It never changes the customer-facing suggestedReply. */
  applyKnownFacts(result: AIIntentResult, message: string, recentMessages: string[]): AIIntentResult {
    const corrected = this.normalizeResult(result);
    const text = [message, ...recentMessages].join(" ").toLowerCase();
    const facts = JSON.parse(this.buildKnownFacts(message, recentMessages)) as KnownOrderFacts;
    const details = corrected.details;

    if (facts.product) {
      const existing = details.flavors ?? [];
      const found = existing.find(item => item.name.toLowerCase() === facts.product!.name.toLowerCase());
      if (!found && (facts.quantity ?? 0) > 0) {
        details.flavors = [{ name: facts.product.name, quantity: facts.quantity!, unitPrice: facts.product.price, subtotal: facts.quantity! * facts.product.price }, ...existing];
      } else if (found) {
        found.unitPrice = facts.product.price;
        if (facts.quantity) found.quantity = facts.quantity;
        found.subtotal = found.quantity * facts.product.price;
      }
    }

    if (facts.quantity) details.quantity = Math.max(details.quantity ?? 0, facts.quantity);
    if (facts.deliveryMethod) details.deliveryMethod = facts.deliveryMethod;
    if (facts.paymentMethod) details.paymentMethod = facts.paymentMethod;

    details.flavors = (details.flavors ?? []).filter(item => item && item.name && item.quantity > 0);
    const totalQty = details.flavors.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQty > 0) details.quantity = totalQty;

    details.flavors = details.flavors.map(item => {
      const price = PRODUCTS.find(p => p.name.toLowerCase() === item.name.toLowerCase())?.price ?? item.unitPrice ?? 0;
      return { ...item, unitPrice: price || undefined, subtotal: price ? price * item.quantity : item.subtotal };
    });
    details.totalAmount = details.flavors.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) || undefined;

    const hasFlavor = details.flavors.length > 0;
    const hasQuantity = (details.quantity ?? 0) >= 10;
    const hasDelivery = details.deliveryMethod === "pickup" || details.deliveryMethod === "maxim";
    const hasPayment = details.paymentMethod === "cod" || details.paymentMethod === "gcash";
    const hasAddress = details.deliveryMethod !== "maxim" || (!!details.address && !!details.landmark && !!details.contactNumber);

    details.missingFields = [];
    if (!hasFlavor) details.missingFields.push("flavor");
    if (!hasQuantity) details.missingFields.push("quantity");
    if (!hasDelivery) details.missingFields.push("pickup or delivery");
    if (!hasPayment) details.missingFields.push("payment method");
    if (details.deliveryMethod === "maxim") {
      if (!details.address) details.missingFields.push("address");
      if (!details.landmark) details.missingFields.push("landmark");
      if (!details.contactNumber) details.missingFields.push("contact number");
    }

    const explicitConfirmation = /\b(yes|correct|confirmed|confirm|go ahead|place my order|place the order|order it|that's correct|that is correct|okay proceed|proceed)\b/i.test(message);
    details.confirmed = explicitConfirmation && hasFlavor && hasQuantity && hasDelivery && hasPayment && hasAddress && details.missingFields.length === 0;

    if (/\b(?:none provided|unknown|not available)\b/i.test(text)) {
      details.address = details.address && !/\b(?:none provided|unknown|not available)\b/i.test(details.address) ? details.address : undefined;
      details.landmark = details.landmark && !/\b(?:none provided|unknown|not available)\b/i.test(details.landmark) ? details.landmark : undefined;
      details.contactNumber = details.contactNumber && !/\b(?:none provided|unknown|not available)\b/i.test(details.contactNumber) ? details.contactNumber : undefined;
    }

    return corrected;
  }

  private buildKnownFacts(message: string, recentMessages: string[]): string {
    const text = [message, ...recentMessages].join(" ").toLowerCase();
    const facts: KnownOrderFacts = {};
    const matchedProducts = PRODUCTS.filter(product => product.aliases.some(alias => text.includes(alias)));
    if (matchedProducts.length === 1) {
      facts.product = { name: matchedProducts[0].name, price: matchedProducts[0].price };
    }
    const quantityMatches = [...text.matchAll(/\b(\d+)\s*(?:pcs?|pieces?)\b/gi)];
    if (quantityMatches.length === 1) facts.quantity = Number(quantityMatches[0][1]);
    if (/\b(?:pickup|pick-up)\b/i.test(text)) facts.deliveryMethod = "pickup";
    else if (/\bmaxim\b/i.test(text)) facts.deliveryMethod = "maxim";
    if (/\bgcash\b/i.test(text)) facts.paymentMethod = "gcash";
    else if (/\b(?:cod|cash on delivery|cash)\b/i.test(text)) facts.paymentMethod = "cod";
    return JSON.stringify(facts);
  }
}
