import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult, CustomerIntent } from "./types";

const CUSTOMER_SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz.

The CURRENT CUSTOMER MESSAGE is the highest priority. Answer that message first.
Previous conversation is background only and must never override a new or unrelated question.
Treat each new message as a new question unless the customer clearly refers to an existing order.
Do not repeat the previous assistant answer unless the current message asks for it.
A greeting is not an order. A flavor or quantity request is not confirmation.
Only treat a confirmation as confirmation when the customer is clearly confirming a complete order.
Keep replies short, clear, natural, and helpful.
Use Cebuano when the customer uses Cebuano, otherwise English.
Do not ask for information already provided.
Do not ask for a preferred delivery or pickup time.
Do not invent prices, delivery fees, times, policies, availability, or order details.
Do not claim an order was created.

Business facts:
- Minimum order: 10 pcs; mixed flavors are allowed.
- Bacon with Cheese ₱35; Pork Regular ₱20; Pork Regular with Egg ₱25; Pork Asado ₱30.
- Ham & Cheese ₱25; Chicken ₱20; Chicken with Egg ₱25; Ube Empanada ₱25.
- Mango ₱25; Choco ₱30; Beef ₱35; Beef with Egg ₱40.
- Best sellers: Pork Regular with Egg, Chicken with Egg, Beef with Egg.
- Baked is ₱5 more than the original price. Preparation is about 1 hour.
- Payment: GCash or COD. GCash: Alvin Aleguiojo, 09453916796.
- Pickup: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao.
- Maxim delivery is available. For Maxim, Address, Landmark, and Contact # are required.
- Delivery fee varies by location. For the current delivery fee and priority number, direct customers to https://www.empanadahauz.com.
- Orders of 30 pcs or more get 20% off the delivery fee only when the customer asks about a discount.
- If today is Sunday in Asia/Manila, the business is closed and Sunday orders must not be created.
- When presenting a complete order summary before confirmation, end exactly with: Please confirm if all the details above are correct. 😊
- Do NOT use that confirmation sentence after a greeting, menu/flavor list, price answer, delivery-fee answer, or general inquiry.
- "hm" means how much. "df" means delivery fee.
`;

interface OllamaResponse { message?: { content?: string } }

const ORDER_STATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "confidence", "details"],
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
    }
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
    const customerName = context?.customerName?.trim() || "Customer";
    const recentMessages = (context?.recentMessages ?? []).slice(-4);
    const replyContext = this.buildReplyContext(message, recentMessages);
    const systemPrompt = `${CUSTOMER_SYSTEM_PROMPT}\nCurrent date/time in Asia/Manila: ${now}\nCustomer name: ${customerName}`;

    this.logger.log(`AI path=OLLAMA model=${this.model} message=${JSON.stringify(message)}`);

    const suggestedReply = await this.generateCustomerReply(systemPrompt, message, replyContext);

    if (!this.shouldExtractOrderState(message)) {
      const result: AIIntentResult = {
        intent: this.inferNonOrderIntent(message),
        confidence: 0,
        details: { flavors: [], missingFields: [], confirmed: false },
        suggestedReply,
        source: "ollama"
      };
      this.logger.log(`AI path=OLLAMA_SUCCESS intent=${result.intent} extraction=SKIPPED`);
      return result;
    }

    try {
      const extracted = await this.extractOrderState(systemPrompt, message, recentMessages);
      const normalized = this.normalizeResult({ ...extracted, suggestedReply });
      this.logger.log(`AI path=OLLAMA_SUCCESS confidence=${normalized.confidence} intent=${normalized.intent}`);
      return { ...normalized, source: "ollama" };
    } catch (error) {
      this.logger.warn(`AI order extraction unavailable; keeping Qwen customer reply reason=${String(error)}`);
      return {
        intent: this.inferNonOrderIntent(message),
        confidence: 0,
        details: { flavors: [], missingFields: [], confirmed: false },
        suggestedReply,
        source: "ollama"
      };
    }
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

  private async extractOrderState(systemPrompt: string, message: string, recentMessages: string[]): Promise<AIIntentResult> {
    const compactContext = recentMessages.length ? recentMessages.join("\n") : "(no previous conversation)";
    const body = {
      model: this.model,
      stream: false,
      format: ORDER_STATE_SCHEMA,
      think: false,
      options: { temperature: 0, num_predict: 384, num_ctx: 3072 },
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nThis call is ONLY for order state used by the application. Extract order details from the CURRENT CUSTOMER MESSAGE and previous messages only when they clearly belong to the same active order. The current message has priority. A greeting, question, price request, delivery-fee question, flavor request, or quantity request is NOT confirmation. Set confirmed=true only when the current message clearly confirms a complete order that already has all required fields. Do not invent missing values.`
        },
        { role: "user", content: `CURRENT CUSTOMER MESSAGE:\n${message}\n\nRECENT CONVERSATION:\n${compactContext}` }
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

  private buildReplyContext(message: string, recentMessages: string[]): string {
    if (!recentMessages.length) return "CONVERSATION CONTEXT: none. Treat this as a new interaction.";

    const lower = message.toLowerCase().trim();
    const hasConcreteOrderDetails = /\b\d+\s*(?:pcs?|pieces?)\b/i.test(lower)
      || /\b(bacon|pork|asado|ham|cheese|chicken|ube|mango|choco|chocolate|beef)\b/i.test(lower)
      || /\b(hm|how much|price|pila|tagpila|presyo|df|delivery fee)\b/i.test(lower)
      || /\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(lower);

    if (hasConcreteOrderDetails) {
      return "CONVERSATION CONTEXT: none. Treat the current message as a fresh request. Do not repeat any previous answer.";
    }

    const isExplicitFollowUp = /^(yes|yeah|yep|yes that's correct|yes thats correct|that's correct|thats correct|correct|confirmed|confirm|go ahead|proceed|okay proceed|same|same order|add that|remove that|change that)$/i.test(lower)
      || /^(pickup|pick up|maxim|gcash|cod|same order|continue|continue my order)$/i.test(lower)
      || /\b(change|remove|add|instead|same order)\b/i.test(lower);

    if (!isExplicitFollowUp) {
      return "CONVERSATION CONTEXT: none. Treat the current message as a fresh request. Do not repeat any previous answer.";
    }

    const relevant = recentMessages.slice(-2);
    return `CONVERSATION CONTEXT (only for the explicit follow-up; current message wins):\n${relevant.join("\n")}`;
  }

  private shouldExtractOrderState(message: string): boolean {
    const lower = message.toLowerCase().trim();
    if (/\b(hm|how much|price|pila|tagpila|presyo)\b/.test(lower)) {
      return /\border\b|\bpcs?\b|\bpieces?\b|\badd\b|\bremove\b|\bchange\b|\bpickup\b|\bmaxim\b|\bgcash\b|\bcod\b/.test(lower);
    }
    return /\border\b|\b\d+\s*(?:pcs?|pieces?)\b|\bpickup\b|\bpick up\b|\bmaxim\b|\bgcash\b|\bcod\b|\baddress\b|\blandmark\b|\bcontact\b|\bconfirm(?:ed|ation)?\b|\bgo ahead\b|\bproceed\b|\b(yes|yeah|yep|correct)\b/i.test(lower);
  }

  private inferNonOrderIntent(message: string): CustomerIntent {
    const lower = message.toLowerCase();
    if (/\b(hm|how much|price|pila|tagpila|presyo)\b/.test(lower)) return "pricing_question";
    if (/\b(delivery|deliver|maxim|df)\b/.test(lower)) return "delivery_request";
    if (/\b(pickup|pick up)\b/.test(lower)) return "pickup_request";
    return "inquiry";
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
      confidence: typeof result?.confidence === "number" ? Math.max(0, Math.min(1, result.confidence)) : 0,
      details: {
        ...details,
        flavors: Array.isArray(details.flavors) ? details.flavors : [],
        missingFields: Array.isArray(details.missingFields) ? details.missingFields : [],
        confirmed: details.confirmed === true
      },
      suggestedReply: typeof result?.suggestedReply === "string" ? result.suggestedReply.trim() : ""
    };
  }
}
