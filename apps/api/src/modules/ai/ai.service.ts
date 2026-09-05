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
    const recentMessages = (context?.recentMessages ?? []).slice(-6);
    const conversationContext = recentMessages.length ? `\nRecent conversation:\n${recentMessages.join("\n")}` : "";
    const knownFacts = this.buildKnownFacts(message);
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
      this.logger.log(`AI path=OLLAMA_SUCCESS confidence=${result.confidence} intent=${result.intent}`);
      return { ...result, source: "ollama" };
    } catch (error) {
      this.logger.warn(`AI path=FALLBACK reason=${String(error)} message=${JSON.stringify(message)}`);
      return { ...this.fallbackParse(message), source: "fallback" };
    }
  }

  private async callOllama(input: {
    systemPrompt: string;
    schema: object;
    conversationContext: string;
    knownFacts: string;
    message: string;
  }): Promise<AIIntentResult> {
    const body = {
      model: this.model,
      stream: false,
      format: "json",
      think: false,
      options: { temperature: 0.1, num_predict: 512, num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: `${input.systemPrompt}\n\nImportant: YOU are the customer-facing AI. Always generate the suggestedReply yourself. Do not use a canned fallback reply. Use the recent conversation and known facts to maintain context across turns. Treat known facts as extracted hints, not as permission to invent missing information. Never mark an order confirmed when required fields are missing. Never claim an order was created unless the application says it was created.\n\nJSON schema:\n${JSON.stringify(input.schema)}`
        },
        {
          role: "user",
          content: `${input.conversationContext}\nKnown facts from the application:\n${input.knownFacts}\nCustomer message:\n${input.message}`
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
      const parsed = JSON.parse(content) as AIIntentResult;
      return this.normalizeResult(parsed);
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && /JSON/i.test(error.message))) {
        this.logger.warn(`AI path=OLLAMA_RETRY reason=${String(error)}`);
        return await this.callOllamaRetry(input);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOllamaRetry(input: {
    systemPrompt: string;
    schema: object;
    conversationContext: string;
    knownFacts: string;
    message: string;
  }): Promise<AIIntentResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          think: false,
          options: { temperature: 0, num_predict: 384, num_ctx: 3072 },
          messages: [
            {
              role: "system",
              content: `${input.systemPrompt}\n\nReturn ONE compact JSON object only. Do not explain anything. Always write a customer-facing suggestedReply. Keep suggestedReply short so the JSON cannot be truncated. JSON schema:\n${JSON.stringify(input.schema)}`
            },
            {
              role: "user",
              content: `${input.conversationContext}\nKnown facts:\n${input.knownFacts}\nCustomer message:\n${input.message}`
            }
          ]
        })
      });
      if (!response.ok) throw new Error(`Ollama retry failed: ${response.status} ${await response.text()}`);
      const body = await response.json() as OllamaResponse;
      const content = body.message?.content?.trim();
      if (!content) throw new Error("Ollama retry returned an empty response");
      const result = this.normalizeResult(JSON.parse(content) as AIIntentResult);
      this.logger.log(`AI path=OLLAMA_RETRY_SUCCESS confidence=${result.confidence} intent=${result.intent}`);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildKnownFacts(message: string) {
    const lower = message.toLowerCase().trim();
    const product = this.findProduct(lower);
    const quantity = this.extractQuantity(lower);
    const deliveryMethod = this.extractDeliveryMethod(lower);
    const paymentMethod = this.extractPaymentMethod(lower);
    const facts = [
      product ? `Current-message product candidate: ${product.name} at ₱${product.price}.` : "Current-message product candidate: none.",
      quantity ? `Current-message quantity candidate: ${quantity}.` : "Current-message quantity candidate: none.",
      deliveryMethod ? `Current-message delivery method candidate: ${deliveryMethod}.` : "Current-message delivery method candidate: none.",
      paymentMethod ? `Current-message payment candidate: ${paymentMethod}.` : "Current-message payment candidate: none."
    ];
    return facts.join("\n");
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

  private normalizeResult(result: AIIntentResult): AIIntentResult {
    const details = result.details ?? { missingFields: [] };
    details.missingFields = Array.isArray(details.missingFields) ? details.missingFields : [];
    details.flavors = Array.isArray(details.flavors) ? details.flavors : [];
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
