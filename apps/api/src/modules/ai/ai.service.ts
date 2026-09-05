import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult } from "./types";

const EMPANADA_SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz.

You answer EVERY customer message yourself.
Use the customer's current message and relevant recent conversation together with these business rules.
Decide what the customer is actually asking before answering.
Never assume a normal question is an order confirmation.
Never let an old order discussion override a new unrelated question.
Do not invent prices, order details, delivery times, or policies.
Keep replies short, clear, natural, and helpful.
Use Cebuano when the customer uses Cebuano, otherwise English.

Business rules:
- Minimum order: 10 pcs.
- Mixed flavors are allowed.
- Prices: New Flavor Bacon with Cheese ₱35; Pork Regular ₱20; Pork Regular with Egg ₱25; Pork Asado ₱30; Ham & Cheese ₱25; Chicken ₱20; Chicken with Egg ₱25; Ube Empanada ₱25; Mango ₱25; Choco ₱30; Beef ₱35; Beef with Egg ₱40.
- Best sellers: Pork Regular with Egg, Chicken with Egg, Beef with Egg.
- Payment: GCash or COD. GCash: Alvin Aleguiojo, 09453916796.
- Pickup: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao. Beside Prince Bulacao.
- Maxim delivery is available.
- For Maxim, collect Address, Landmark, and Contact #. Do not ask for a preferred delivery time.
- Pickup orders need flavor, quantity, payment method, and pickup/delivery choice before confirmation.
- Baked is ₱5 more than the original price.
- Preparation is approximately 1 hour.
- Orders of 30 pcs or more get 20% off the delivery fee only, and only when the customer asks about a discount.
- If a customer schedules an order, preserve the date and time; never invent a time.
- If today is Sunday in Asia/Manila, tell customers the business is closed and do not create Sunday orders.
- Never treat placeholder strings such as "none provided", "unknown", or "not available" as real customer information.
- Before confirmation, when an order summary is appropriate, end exactly with: "Please confirm if all the details above are correct. 😊"
- Never claim an order was created unless the application has successfully created it.
- After the application successfully creates a confirmed order, the application sends the ready message.

Conversation behavior:
- "hm" means how much.
- "df" means delivery fee.
- A flavor request is not confirmation.
- A quantity is not confirmation.
- The word "confirm" is confirmation only when the customer has already provided all required order details.
- Answer the customer's actual question first.
- Do not ask for information the customer already provided.
- Do not ask for a preferred delivery or pickup time.
`;

interface OllamaResponse { message?: { content?: string } }

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
    intent: { type: "string", enum: ["inquiry", "order_confirmation", "reservation", "delivery_request", "pickup_request", "pricing_question"] },
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
    const systemPrompt = `${EMPANADA_SYSTEM_PROMPT}\nCurrent date/time in Asia/Manila: ${now}\nCustomer name: ${context?.customerName ?? "Customer"}`;
    const recentMessages = (context?.recentMessages ?? []).slice(-12);
    const conversationContext = recentMessages.length ? recentMessages.join("\n") : "(no previous conversation)";

    this.logger.log(`AI path=OLLAMA model=${this.model} message=${JSON.stringify(message)}`);

    const suggestedReply = await this.generateCustomerReply(systemPrompt, message, conversationContext);

    let extracted: AIIntentResult;
    try {
      extracted = await this.extractOrderState(systemPrompt, message, conversationContext);
    } catch (error) {
      this.logger.warn(`AI extraction failed; customer reply remains Qwen-only reason=${String(error)}`);
      extracted = {
        intent: "inquiry",
        confidence: 0,
        details: { flavors: [], missingFields: [], confirmed: false },
        suggestedReply
      };
    }

    const normalized = this.normalizeResult({ ...extracted, suggestedReply });
    this.logger.log(`AI path=OLLAMA_SUCCESS confidence=${normalized.confidence} intent=${normalized.intent}`);
    return { ...normalized, source: "ollama" };
  }

  private async generateCustomerReply(systemPrompt: string, message: string, conversationContext: string): Promise<string> {
    const body = {
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.35, num_predict: 256, num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nYou are now answering the customer directly. The response you write will be sent to Messenger exactly as returned. Do not output JSON, labels, analysis, intent names, or instructions to the application. Answer naturally in one concise customer-facing message.`
        },
        {
          role: "user",
          content: `CURRENT CUSTOMER MESSAGE:\n${message}\n\nRELEVANT RECENT CONVERSATION:\n${conversationContext}`
        }
      ]
    };

    const response = await this.ollamaChat(body, "Ollama customer reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty customer reply");
    this.logger.log(`AI customer reply generated model=${this.model} message=${JSON.stringify(message)}`);
    return reply.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  private async extractOrderState(systemPrompt: string, message: string, conversationContext: string): Promise<AIIntentResult> {
    const body = {
      model: this.model,
      stream: false,
      format: OLLAMA_RESULT_SCHEMA,
      think: false,
      options: { temperature: 0, num_predict: 640, num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nThis call is ONLY for structured order state used by the application. Extract what the customer actually provided and determine whether they explicitly confirmed a complete order. Do not write the customer-facing response here beyond the suggestedReply field. Use the conversation context to preserve relevant order details.`
        },
        {
          role: "user",
          content: `CURRENT CUSTOMER MESSAGE:\n${message}\n\nRECENT CONVERSATION:\n${conversationContext}`
        }
      ]
    };

    const response = await this.ollamaChat(body, "Ollama order extraction failed");
    const content = response.message?.content?.trim();
    if (!content) throw new Error("Ollama returned empty order extraction");
    return this.normalizeResult(this.parseStructuredJson(content) as AIIntentResult);
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

  /** Structured validation for MCP execution only. It never changes the Qwen customer reply. */
  applyKnownFacts(result: AIIntentResult, message: string, recentMessages: string[]): AIIntentResult {
    const corrected = this.normalizeResult(result);
    const text = [message, ...recentMessages].join(" ").toLowerCase();
    const details = corrected.details;

    details.flavors = (details.flavors ?? []).filter(item => item && item.name && item.quantity > 0);
    details.flavors = details.flavors.map(item => {
      const normalizedName = item.name.toLowerCase();
      const product = PRODUCTS.find(p => p.name.toLowerCase() === normalizedName || p.aliases.some(alias => normalizedName === alias));
      const price = product?.price ?? item.unitPrice ?? 0;
      return {
        ...item,
        name: product?.name ?? item.name,
        unitPrice: price || undefined,
        subtotal: price ? price * item.quantity : item.subtotal
      };
    });

    const totalQty = details.flavors.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQty > 0) details.quantity = totalQty;
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
}
