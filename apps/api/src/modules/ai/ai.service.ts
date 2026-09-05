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
    const fast = this.tryFastPath(message);
    if (fast) {
      this.logger.log(`AI path=FAST_PATH confidence=${fast.confidence} intent=${fast.intent} message=${JSON.stringify(message)}`);
      return { ...fast, source: "fast_path" };
    }

    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const systemPrompt = EMPANADA_SYSTEM_PROMPT
      .replace("{{CURRENT_DATE_TIME}}", now)
      .replaceAll("{{Customer's Name}}", context?.customerName ?? "Customer");
    const recentMessages = (context?.recentMessages ?? []).slice(-6);
    const conversationContext = recentMessages.length ? `\nRecent conversation:\n${recentMessages.join("\n")}` : "";
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            stream: false,
            format: "json",
            think: false,
            options: { temperature: 0.1, num_predict: 300, num_ctx: 4096 },
            messages: [
              { role: "system", content: `${systemPrompt}\n\nJSON schema:\n${JSON.stringify(schema)}` },
              { role: "user", content: `${conversationContext}\nCustomer message:\n${message}` }
            ]
          })
        });
      } finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
      const body = await response.json() as OllamaResponse;
      const content = body.message?.content?.trim();
      if (!content) throw new Error("Ollama returned an empty response");
      const result = this.normalizeResult(JSON.parse(content) as AIIntentResult, message);
      this.logger.log(`AI path=OLLAMA_SUCCESS confidence=${result.confidence} intent=${result.intent}`);
      return { ...result, source: "ollama" };
    } catch (error) {
      this.logger.warn(`AI path=FALLBACK reason=${String(error)} message=${JSON.stringify(message)}`);
      return { ...this.fallbackParse(message), source: "fallback" };
    }
  }

  private tryFastPath(message: string): AIIntentResult | null {
    const lower = message.toLowerCase().trim();
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|yo)\b/.test(lower)) {
      return { intent: "inquiry", confidence: 1, details: { missingFields: [], flavors: [] }, suggestedReply: "Hello! 😊 How can I help you with your empanada order?" };
    }

    const asksPrice = /\b(hm|how much|price|pila|tagpila|presyo)\b/.test(lower);
    const product = this.findProduct(lower);
    if (asksPrice && product) {
      return { intent: "pricing_question", confidence: 1, details: { missingFields: [], flavors: [] }, suggestedReply: `- ${product.name} — ₱${product.price}` };
    }
    if (asksPrice && !product) return null;

    const quantity = this.extractQuantity(lower);
    if (!quantity) return null;
    if (!product) {
      const deliveryMethod = this.extractDeliveryMethod(lower);
      return {
        intent: deliveryMethod === "pickup" ? "pickup_request" : deliveryMethod === "maxim" ? "delivery_request" : "inquiry",
        confidence: 0.95,
        details: { quantity, deliveryMethod, missingFields: ["flavors"], flavors: [] },
        suggestedReply: "Sure! 😊 What flavor would you like for the order?"
      };
    }

    const flavor: Flavor = { name: product.name, quantity, unitPrice: product.price, subtotal: quantity * product.price };
    const deliveryMethod = this.extractDeliveryMethod(lower);
    const paymentMethod = this.extractPaymentMethod(lower);
    const address = this.extractField(lower, /address[:\s]+(.+?)(?:\s+landmark[:\s]+|\s+contact(?:\s*#)?[:\s]+|$)/i);
    const landmark = this.extractField(lower, /landmark[:\s]+(.+?)(?:\s+contact(?:\s*#)?[:\s]+|$)/i);
    const contactNumber = this.extractField(lower, /contact(?:\s*#| number)?[:\s]+([+\d][\d\s-]{6,})/i);
    const missingFields: string[] = [];
    if (!deliveryMethod) missingFields.push("deliveryMethod");
    if (!paymentMethod) missingFields.push("paymentMethod");
    if (deliveryMethod === "maxim") {
      if (!address) missingFields.push("address");
      if (!landmark) missingFields.push("landmark");
      if (!contactNumber) missingFields.push("contactNumber");
    }
    const complete = quantity >= 10 && Boolean(deliveryMethod && paymentMethod) && (deliveryMethod === "pickup" || Boolean(address && landmark && contactNumber));
    const reply = complete
      ? this.orderSummary(flavor, quantity, deliveryMethod!, paymentMethod!, address)
      : this.askForMissing(missingFields, deliveryMethod);
    return {
      intent: complete ? "order_confirmation" : deliveryMethod === "pickup" ? "pickup_request" : deliveryMethod === "maxim" ? "delivery_request" : "inquiry",
      confidence: 0.95,
      details: { quantity, deliveryMethod, paymentMethod, address, landmark, contactNumber, flavors: [flavor], totalAmount: flavor.subtotal, confirmed: false, missingFields },
      suggestedReply: reply
    };
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
    return match?.[1]?.trim() || undefined;
  }

  private askForMissing(missing: string[], deliveryMethod?: "pickup" | "maxim") {
    if (!deliveryMethod) return "Would you like pickup or Maxim delivery? 😊";
    if (missing.includes("paymentMethod")) return "Would you like to pay by GCash or Cash on Delivery (COD)? 😊";
    if (deliveryMethod === "maxim") {
      const labels: Record<string, string> = { address: "Address", landmark: "Landmark", contactNumber: "Contact #" };
      const lines = missing.filter((item) => labels[item]).map((item) => `- ${labels[item]}:`);
      if (lines.length) return `Please provide the missing details:\n${lines.join("\n")}`;
    }
    return "Please provide the remaining order details. 😊";
  }

  private orderSummary(flavor: Flavor, quantity: number, deliveryMethod: "pickup" | "maxim", paymentMethod: "cod" | "gcash", address?: string) {
    return [
      "Order Summary:",
      `- ${flavor.name} × ${quantity} — ₱${flavor.subtotal}`,
      `- Total Quantity: ${quantity} pcs`,
      `- Total Amount: ₱${flavor.subtotal}`,
      `- Order Type: ${deliveryMethod === "pickup" ? "Pickup" : "Delivery"}`,
      `- Payment Method: ${paymentMethod === "gcash" ? "GCash" : "Cash on Delivery (COD)"}`,
      ...(deliveryMethod === "maxim" && address ? [`- Delivery Address: ${address}`] : []),
      "\nPlease confirm if all the details above are correct. 😊"
    ].join("\n");
  }

  private normalizeResult(result: AIIntentResult, message: string): AIIntentResult {
    const details = result.details ?? { missingFields: [] };
    details.missingFields = Array.isArray(details.missingFields) ? details.missingFields : [];
    details.flavors = Array.isArray(details.flavors) ? details.flavors : [];
    result.confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
    if (!result.intent) result.intent = "inquiry";
    if (!result.suggestedReply?.trim()) result.suggestedReply = this.fallbackParse(message).suggestedReply;
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
    const fast = this.tryFastPath(message);
    if (fast) return fast;
    return {
      intent,
      confidence: 0.5,
      details: { quantity, deliveryMethod, missingFields: product ? [] : ["flavors"], flavors: product && quantity ? [{ name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity }] : [] },
      suggestedReply: product && quantity ? `I can help with that. Would you like pickup or Maxim delivery? 😊` : "Sure! 😊 What would you like to order?"
    };
  }
}
