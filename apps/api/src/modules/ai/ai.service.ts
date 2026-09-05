import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult, CustomerIntent } from "./types";

const CUSTOMER_SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz.

The CURRENT CUSTOMER MESSAGE is highest priority. Understand what the customer means even when the message uses abbreviations, shorthand, misspellings, slang, mixed English/Cebuano, incomplete phrases, or alternative wording.
Use the application order state as context for follow-up messages. Never make the customer repeat information already provided.
Do not require exact field names. Infer meaning from the full message and conversation.

Examples of language understanding:
- hm = how much
- df = delivery fee
- pcs, pc, piece, pieces = quantity
- w, w/, +, with = with
- egg after a flavor can mean with egg when context supports it
- max = Maxim
- pickup, pick up, pick-up = Pickup
- cash = COD
- cp, mobile, phone, contact, contact#, contact # = Contact # when followed by a phone number
- addr = address
- lmk = landmark when context supports it
- beef egg, beef w egg, beef + egg = Beef with Egg
- pork egg, pork w egg, pork + egg = Pork Regular with Egg
- chicken egg, chicken w egg, chicken + egg = Chicken with Egg
- asado = Pork Asado
- ube = Ube Empanada
- choco, chocolate = Choco

Understand natural variations such as:
- 10 pcs beef egg
- beef w egg 10pcs
- 10 beef egg
- can i get 10 beef with egg
- hm beef egg
- max and cash
- send summary
- can send the summary of my order?
- i already provided it right?
- address: ... landmark: ... contact#092131232

Normalize the customer's meaning into the known Empanada Hauz product names and order fields when the intent is clear.
Do not invent facts. If meaning is genuinely unclear, leave that field unresolved rather than guessing.

Order requirements:
- Minimum order is 10 pcs.
- Mixed flavors are allowed.
- Maxim delivery requires Address, Landmark, and Contact #.
- Pickup does not require delivery address details.
- Payment is GCash or COD.
- Cash means COD, never GCash.
- Never ask for confirmation while required information is missing.
- A summary request means show the current order summary; it is not confirmation.
- Never say an order is confirmed/placed/created unless the application actually created it.
- Do not ask for a preferred delivery or pickup time.
- Use Cebuano when the customer uses Cebuano, otherwise English.
- Keep the customer reply short, clear, natural, and helpful.

Business facts:
- Bacon with Cheese ₱35; Pork Regular ₱20; Pork Regular with Egg ₱25; Pork Asado ₱30.
- Ham & Cheese ₱25; Chicken ₱20; Chicken with Egg ₱25; Ube Empanada ₱25.
- Mango ₱25; Choco ₱30; Beef ₱35; Beef with Egg ₱40.
- Baked is ₱5 more. Preparation is about 1 hour.
- GCash: Alvin Aleguiojo, 09453916796.
- Pickup: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao.
- Maxim delivery is available; delivery fee varies by location.
- 30+ pcs gets 20% off the delivery fee only when the customer asks about a discount.

Return JSON only with this shape:
{
  "reply": "short customer-facing reply",
  "details": {
    "quantity": 0,
    "deliveryMethod": "pickup|maxim",
    "paymentMethod": "cod|gcash",
    "address": "...",
    "landmark": "...",
    "contactNumber": "...",
    "deliveryDate": "YYYY-MM-DD",
    "preferredTime": "...",
    "flavors": [{"name":"Known Product Name","quantity":0}],
    "confirmed": false
  }
}
Use only the fields that are actually understood. `flavors` should be an empty array when no flavor is understood.`;

interface OllamaResponse { message?: { content?: string } }
type Details = AIIntentResult["details"];

type AiPayload = {
  reply?: string;
  details?: {
    quantity?: number;
    location?: string;
    deliveryMethod?: "pickup" | "maxim";
    preferredTime?: string;
    deliveryDate?: string;
    address?: string;
    landmark?: string;
    contactNumber?: string;
    paymentMethod?: "cod" | "gcash";
    flavors?: Array<{ name?: string; quantity?: number }>;
    confirmed?: boolean;
  };
};

const PRICES: Record<string, number> = {
  "bacon with cheese": 35,
  "pork regular": 20,
  "pork regular with egg": 25,
  "pork asado": 30,
  "ham & cheese": 25,
  "ham and cheese": 25,
  "ham cheese": 25,
  chicken: 20,
  "chicken with egg": 25,
  ube: 25,
  "ube empanada": 25,
  mango: 25,
  choco: 30,
  chocolate: 30,
  beef: 35,
  "beef with egg": 40
};

const CANONICAL_FLAVORS: Array<{ name: string; aliases: string[] }> = [
  { name: "Bacon with Cheese", aliases: ["bacon with cheese"] },
  { name: "Pork Regular with Egg", aliases: ["pork regular with egg", "pork with egg", "pork egg"] },
  { name: "Pork Regular", aliases: ["pork regular", "pork"] },
  { name: "Pork Asado", aliases: ["pork asado", "asado"] },
  { name: "Ham & Cheese", aliases: ["ham & cheese", "ham and cheese", "ham cheese"] },
  { name: "Chicken with Egg", aliases: ["chicken with egg", "chicken egg"] },
  { name: "Chicken", aliases: ["chicken"] },
  { name: "Ube Empanada", aliases: ["ube empanada", "ube"] },
  { name: "Mango", aliases: ["mango"] },
  { name: "Choco", aliases: ["choco", "chocolate"] },
  { name: "Beef with Egg", aliases: ["beef with egg", "beef egg"] },
  { name: "Beef", aliases: ["beef"] }
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

  async classifyAndExtract(
    message: string,
    context?: { customerName?: string; recentMessages?: string[]; activeOrderState?: Details }
  ): Promise<AIIntentResult> {
    const now = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "full",
      timeStyle: "long"
    }).format(new Date());

    const recentMessages = (context?.recentMessages ?? []).slice(-6);
    const lower = message.toLowerCase().trim();
    const activeOrderState = context?.activeOrderState && this.shouldReuseActiveOrder(lower)
      ? context.activeOrderState
      : undefined;

    const prompt = [
      CUSTOMER_SYSTEM_PROMPT,
      `Current date/time in Asia/Manila: ${now}`,
      `Customer name: ${context?.customerName?.trim() || "Customer"}`,
      `ACTIVE ORDER STATE: ${JSON.stringify(activeOrderState ?? null)}`,
      recentMessages.length ? `RECENT CONVERSATION:\n${recentMessages.join("\n")}` : "RECENT CONVERSATION: none",
      `CURRENT CUSTOMER MESSAGE: ${message}`
    ].join("\n\n");

    const payload = await this.ollamaStructured<{ reply?: string; details?: AiPayload["details"] }>(
      prompt,
      "Ollama customer interpretation failed"
    );

    const details = this.mergeAndValidateDetails(payload.details ?? {}, activeOrderState);
    const suggestedReply = this.cleanReply(payload.reply ?? "");
    if (!suggestedReply) throw new Error("Ollama returned an empty customer reply");

    const intent = this.inferIntent(message, details);
    this.logger.log(`AI customer reply generated model=${this.model} message=${JSON.stringify(message)}`);
    return {
      intent,
      confidence: details.flavors.length || details.confirmed || details.deliveryMethod || details.paymentMethod ? 1 : 0,
      details,
      suggestedReply,
      source: "ollama"
    };
  }

  async generateOrderResultReply(outcome: "created" | "failed", orderNumber?: string): Promise<string> {
    const status = outcome === "created"
      ? `The application successfully created the customer's confirmed order.${orderNumber ? ` Order number: ${orderNumber}.` : ""}`
      : "The application could not create the customer's confirmed order.";
    const payload = await this.ollamaStructured<{ reply?: string }>(
      `${CUSTOMER_SYSTEM_PROMPT}\nGenerate only a short customer-facing reply. Never mention internal tools or MCP.\nAPPLICATION RESULT: ${status}`,
      "Ollama order result reply failed",
      { num_predict: 96, num_ctx: 1536 }
    );
    const reply = this.cleanReply(payload.reply ?? "");
    if (!reply) throw new Error("Ollama returned an empty order result reply");
    return reply;
  }

  private async ollamaStructured<T>(systemContent: string, errorPrefix: string, options?: Record<string, unknown>): Promise<T> {
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 256, num_ctx: 2048, ...(options ?? {}) },
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: "Return the requested JSON only." }
      ]
    }, errorPrefix);

    const content = response.message?.content?.trim();
    if (!content) throw new Error(`${errorPrefix}: empty response`);
    try {
      return JSON.parse(content) as T;
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1)) as T;
      throw new Error(`${errorPrefix}: invalid JSON response`);
    }
  }

  private async ollamaChat(body: Record<string, unknown>, errorPrefix: string): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
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

  private shouldReuseActiveOrder(lower: string) {
    if (!lower) return true;
    if (/^(hello|hi|hey|good morning|good afternoon|good evening)$/.test(lower)) return false;
    if (/\b(start a new order|new order|different order)\b/i.test(lower)) return false;
    return true;
  }

  private mergeAndValidateDetails(raw: NonNullable<AiPayload["details"]>, active?: Details): Details {
    const useActive = Boolean(active?.flavors?.length);
    const rawFlavors = Array.isArray(raw.flavors) ? raw.flavors : [];
    const normalizedFlavors = rawFlavors
      .map((item) => {
        const name = this.normalizeFlavorName(item.name);
        const quantity = Number(item.quantity ?? 0);
        if (!name || !Number.isFinite(quantity) || quantity <= 0) return null;
        const unitPrice = PRICES[name.toLowerCase()];
        if (!unitPrice) return null;
        return { name, quantity, unitPrice, subtotal: quantity * unitPrice };
      })
      .filter((item): item is { name: string; quantity: number; unitPrice: number; subtotal: number } => Boolean(item));

    const flavors = normalizedFlavors.length
      ? normalizedFlavors
      : (useActive ? active!.flavors : []);

    const quantity = Number(raw.quantity ?? (flavors.length ? flavors.reduce((sum, item) => sum + item.quantity, 0) : active?.quantity ?? 0));
    const merged: Details = {
      ...(useActive ? active : undefined),
      quantity: quantity > 0 ? quantity : undefined,
      location: raw.location ?? active?.location,
      deliveryMethod: raw.deliveryMethod ?? active?.deliveryMethod,
      preferredTime: raw.preferredTime ?? active?.preferredTime,
      deliveryDate: raw.deliveryDate ?? active?.deliveryDate,
      address: raw.address ?? active?.address,
      landmark: raw.landmark ?? active?.landmark,
      contactNumber: raw.contactNumber ? raw.contactNumber.replace(/\s+/g, "") : active?.contactNumber,
      paymentMethod: raw.paymentMethod ?? active?.paymentMethod,
      flavors,
      confirmed: Boolean(raw.confirmed),
      missingFields: []
    };

    if (merged.flavors.length && merged.quantity) {
      const sum = merged.flavors.reduce((total, item) => total + item.quantity, 0);
      if (sum !== merged.quantity && merged.flavors.length === 1) {
        const only = merged.flavors[0];
        only.quantity = merged.quantity;
        only.subtotal = only.quantity * (only.unitPrice ?? 0);
      }
    }

    const flavorQuantity = merged.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    merged.quantity = merged.flavors.length && flavorQuantity > 0 ? flavorQuantity : merged.quantity;
    merged.totalAmount = merged.flavors.length && merged.flavors.every((item) => item.quantity > 0)
      ? merged.flavors.reduce((sum, item) => sum + (item.subtotal ?? item.quantity * (item.unitPrice ?? 0)), 0)
      : undefined;
    merged.missingFields = this.calculateMissingFields(merged);
    return merged;
  }

  private normalizeFlavorName(value?: string) {
    if (!value?.trim()) return undefined;
    const lower = value.trim().toLowerCase().replace(/\s+/g, " ");
    const exact = CANONICAL_FLAVORS.find((item) => item.name.toLowerCase() === lower);
    if (exact) return exact.name;
    const alias = CANONICAL_FLAVORS.find((item) => item.aliases.some((a) => a === lower));
    return alias?.name;
  }

  private calculateMissingFields(details: Details): string[] {
    const missing: string[] = [];
    const quantity = Number(details.quantity ?? 0);
    const flavorQuantity = details.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (!details.flavors.length) missing.push("flavors");
    if (!quantity || (details.flavors.length > 0 && flavorQuantity !== quantity)) missing.push("quantity");
    if (quantity > 0 && quantity < 10) missing.push("minimumOrder");
    if (!details.deliveryMethod) missing.push("deliveryMethod");
    if (!details.paymentMethod) missing.push("paymentMethod");
    if (details.deliveryMethod === "maxim") {
      if (!details.address?.trim()) missing.push("address");
      if (!details.landmark?.trim()) missing.push("landmark");
      if (!details.contactNumber?.trim()) missing.push("contactNumber");
    }
    return [...new Set(missing)];
  }

  private inferIntent(message: string, details: Details): CustomerIntent {
    const lower = message.toLowerCase();
    if (this.isConfirmationMessage(lower)) return "order_confirmation";
    if (/\b(delivery fee|\bdf\b)\b/.test(lower)) return "delivery_request";
    if (/\b(pickup|pick up|pick-up)\b/.test(lower)) return "pickup_request";
    if (/\b(hm|how much|price|pila|tagpila|presyo|total|total cost)\b/.test(lower) && !details.flavors.length) return "pricing_question";
    if (details.flavors.length || /\border\b|\b\d+\s*(?:pcs?|pieces?)\b/.test(lower)) return "reservation";
    return "inquiry";
  }

  private isConfirmationMessage(lower: string) {
    return /^(yes|yeah|yep|yes that's correct|yes thats correct|that's correct|thats correct|correct|confirmed|confirm|go ahead|proceed|okay proceed|yes all are correct|yes all correct|all are correct|everything is correct|place my order|place the order|order it)$/i.test(lower.trim()) || /\b(place my order|place the order|order it)\b/i.test(lower.trim());
  }

  private cleanReply(reply: string) {
    return reply
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/\[(?:😊|🙂|😄)\]\([^)]*\)/g, "😊")
      .trim();
  }
}
