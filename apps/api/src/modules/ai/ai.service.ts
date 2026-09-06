import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult, CustomerIntent, DeliveryMethodValue } from "./types";

const CUSTOMER_SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz.

The CURRENT CUSTOMER MESSAGE is highest priority. Answer it directly.
Interpret the CURRENT CUSTOMER MESSAGE semantically. Do not assume the customer's wording must match predefined aliases.
The application will merge your interpretation with the previous active order state.
A greeting starts a fresh conversation unless the customer explicitly refers to an existing order.
A flavor-only request needs a quantity; ask how many pcs.
An order with missing required fields is NOT ready for confirmation.
Never ask for confirmation when required fields are missing.
For Maxim delivery, collect Address, Landmark, and Contact # before confirmation.
Pickup does not require delivery address details.
CASH means COD. Only explicit GCash means GCash.
A summary request means SHOW THE CURRENT ORDER SUMMARY; it is not itself a confirmation.
Never expose internal field names, JSON, intent names, tools, or MCP details.
Never say an order is confirmed/placed/created unless the application actually created it.
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

type Flavor = Details["flavors"][number];

type CurrentInterpretation = {
  intent: CustomerIntent;
  startsNewConversation: boolean;
  flavorAction: "none" | "replace" | "add" | "remove";
  flavors: Array<{ name: string; quantity: number }>;
  quantity?: number;
  location?: string;
  deliveryMethod?: DeliveryMethodValue;
  preferredTime?: string;
  deliveryDate?: string;
  address?: string;
  landmark?: string;
  contactNumber?: string;
  paymentMethod?: "cod" | "gcash";
  confirmed: boolean;
};

const PRICES: Record<string, number> = {
  "bacon with cheese": 35,
  "pork regular": 20,
  "pork regular with egg": 25,
  "pork asado": 30,
  "ham & cheese": 25,
  "ham and cheese": 25,
  "ham cheese": 25,
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

const CANONICAL_FLAVORS = [
  "Bacon with Cheese",
  "Pork Regular",
  "Pork Regular with Egg",
  "Pork Asado",
  "Ham & Cheese",
  "Chicken",
  "Chicken with Egg",
  "Ube Empanada",
  "Mango",
  "Choco",
  "Beef",
  "Beef with Egg"
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
    const current = await this.interpretCurrentMessage(message, now);
    const details = this.mergeOrderState(context?.activeOrderState, current);
    const systemPrompt = `${CUSTOMER_SYSTEM_PROMPT}\nCurrent date/time in Asia/Manila: ${now}\nCustomer name: ${context?.customerName?.trim() || "Customer"}`;
    const replyContext = this.buildReplyContext(message, recentMessages, details);
    const suggestedReply = await this.generateCustomerReply(systemPrompt, message, replyContext);
    const intent = current.intent ?? this.inferIntent(message, details);
    return {
      intent,
      confidence: current.flavors.length || details.flavors.length || current.confirmed || Boolean(details.deliveryMethod) || Boolean(details.paymentMethod) ? 1 : 0,
      details,
      suggestedReply,
      source: "ollama"
    };
  }

  async generateOrderResultReply(outcome: "created" | "failed", orderNumber?: string): Promise<string> {
    const status = outcome === "created"
      ? `APPLICATION RESULT: The application successfully created the customer's confirmed order.${orderNumber ? ` Order number: ${orderNumber}.` : ""}`
      : "APPLICATION RESULT: The application could not create the customer's confirmed order.";
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
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

  private async interpretCurrentMessage(message: string, now: string): Promise<CurrentInterpretation> {
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 256, num_ctx: 2048 },
      messages: [
        {
          role: "system",
          content: `${CUSTOMER_SYSTEM_PROMPT}\n\nReturn ONLY valid JSON for the CURRENT CUSTOMER MESSAGE. Interpret only what the customer says in this message; do not copy fields from prior messages.\n\nSchema:\n{\n  "intent": "inquiry|order_confirmation|reservation|delivery_request|pickup_request|pricing_question",\n  "startsNewConversation": true|false,\n  "flavorAction": "none|replace|add|remove",\n  "flavors": [{"name":"Canonical flavor name","quantity":number}],\n  "quantity": number,\n  "location": "string",\n  "deliveryMethod": "pickup|maxim",\n  "preferredTime": "string",\n  "deliveryDate": "YYYY-MM-DD or understood date text",\n  "address": "string",\n  "landmark": "string",\n  "contactNumber": "string",\n  "paymentMethod": "cod|gcash",\n  "confirmed": true|false\n}\nUse an empty string/empty array or omit a field when it is not present in the current message. Use startsNewConversation=true for a simple greeting that does not reference an existing order. Use flavorAction=replace when the customer is giving a new complete flavor selection, add when explicitly adding items to an existing order, and remove when explicitly removing items.`
        },
        {
          role: "user",
          content: `CURRENT CUSTOMER MESSAGE:\n${message}\n\nCURRENT DATE/TIME IN ASIA/MANILA:\n${now}`
        }
      ]
    }, "Ollama order interpretation failed");

    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty order interpretation");
    try {
      const parsed = JSON.parse(this.cleanReply(raw)) as Partial<CurrentInterpretation>;
      return {
        intent: this.normalizeIntent(parsed.intent),
        startsNewConversation: Boolean(parsed.startsNewConversation),
        flavorAction: parsed.flavorAction === "replace" || parsed.flavorAction === "add" || parsed.flavorAction === "remove" ? parsed.flavorAction : "none",
        flavors: Array.isArray(parsed.flavors)
          ? parsed.flavors
              .map((item) => ({ name: this.normalizeFlavorName(item?.name), quantity: Number(item?.quantity ?? 0) }))
              .filter((item) => item.name && item.quantity > 0)
          : [],
        quantity: this.optionalPositiveNumber(parsed.quantity),
        location: this.optionalText(parsed.location),
        deliveryMethod: parsed.deliveryMethod === "pickup" || parsed.deliveryMethod === "maxim" ? parsed.deliveryMethod : undefined,
        preferredTime: this.optionalText(parsed.preferredTime),
        deliveryDate: this.optionalText(parsed.deliveryDate),
        address: this.optionalText(parsed.address),
        landmark: this.optionalText(parsed.landmark),
        contactNumber: this.normalizePhone(parsed.contactNumber),
        paymentMethod: parsed.paymentMethod === "cod" || parsed.paymentMethod === "gcash" ? parsed.paymentMethod : undefined,
        confirmed: Boolean(parsed.confirmed)
      };
    } catch (error) {
      this.logger.error("Qwen returned invalid structured interpretation", error instanceof Error ? error.message : String(error));
      throw new Error("Qwen returned invalid order interpretation JSON");
    }
  }

  private mergeOrderState(previous: Details | undefined, current: CurrentInterpretation): Details {
    const freshBase: Details = { flavors: [], missingFields: [], confirmed: false };
    if (current.startsNewConversation) return this.finalizeOrderState(this.applyInterpretation(freshBase, current));

    const base = previous ?? freshBase;
    const merged = this.applyInterpretation({ ...base, flavors: [...(base.flavors ?? [])] }, current);
    return this.finalizeOrderState(merged);
  }

  private applyInterpretation(base: Details, current: CurrentInterpretation): Details {
    const merged: Details = { ...base, confirmed: false, missingFields: [] };

    if (current.flavorAction === "replace" && current.flavors.length) {
      merged.flavors = current.flavors.map((item) => this.toFlavor(item));
    } else if (current.flavorAction === "add" && current.flavors.length) {
      merged.flavors = this.mergeFlavorAdds(base.flavors ?? [], current.flavors);
    } else if (current.flavorAction === "remove" && current.flavors.length) {
      merged.flavors = this.removeFlavors(base.flavors ?? [], current.flavors);
    } else if (current.flavors.length) {
      merged.flavors = current.flavors.map((item) => this.toFlavor(item));
    }

    for (const field of [
      "quantity",
      "location",
      "deliveryMethod",
      "preferredTime",
      "deliveryDate",
      "address",
      "landmark",
      "contactNumber",
      "paymentMethod"
    ] as const) {
      const value = current[field];
      if (value !== undefined && value !== "") (merged as Record<string, unknown>)[field] = value;
    }

    if (current.quantity !== undefined && merged.flavors.length === 1 && current.flavorAction !== "add" && current.flavorAction !== "remove") {
      const only = merged.flavors[0];
      merged.flavors = [{ ...only, quantity: current.quantity, subtotal: current.quantity * Number(only.unitPrice ?? 0) }];
      merged.quantity = current.quantity;
    } else if (merged.flavors.length && current.flavorAction !== "add" && current.flavorAction !== "remove") {
      merged.quantity = merged.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    }

    if (current.confirmed) merged.confirmed = true;
    return merged;
  }

  private mergeFlavorAdds(existing: Flavor[], additions: Array<{ name: string; quantity: number }>): Flavor[] {
    const map = new Map(existing.map((item) => [item.name.toLowerCase(), { ...item }]));
    for (const addition of additions) {
      const key = addition.name.toLowerCase();
      const current = map.get(key);
      const quantity = Number(current?.quantity ?? 0) + addition.quantity;
      const unitPrice = current?.unitPrice ?? PRICES[key] ?? 0;
      map.set(key, { name: addition.name, quantity, unitPrice, subtotal: quantity * unitPrice });
    }
    return [...map.values()];
  }

  private removeFlavors(existing: Flavor[], removals: Array<{ name: string; quantity: number }>): Flavor[] {
    const map = new Map(existing.map((item) => [item.name.toLowerCase(), { ...item }]));
    for (const removal of removals) {
      const key = removal.name.toLowerCase();
      const current = map.get(key);
      if (!current) continue;
      const quantity = Number(current.quantity) - removal.quantity;
      if (quantity <= 0) map.delete(key);
      else map.set(key, { ...current, quantity, subtotal: quantity * Number(current.unitPrice ?? 0) });
    }
    return [...map.values()];
  }

  private finalizeOrderState(details: Details): Details {
    const flavors = (details.flavors ?? []).filter((item) => Number(item.quantity) > 0).map((item) => {
      const name = this.normalizeFlavorName(item.name);
      const unitPrice = Number(item.unitPrice ?? PRICES[name.toLowerCase()] ?? 0);
      return { name, quantity: Number(item.quantity), unitPrice, subtotal: Number(item.quantity) * unitPrice };
    });
    const quantity = flavors.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = flavors.reduce((sum, item) => sum + Number(item.subtotal ?? item.quantity * Number(item.unitPrice ?? 0)), 0);
    const finalized: Details = { ...details, flavors, quantity: quantity || details.quantity, totalAmount, missingFields: [] };
    finalized.missingFields = this.calculateMissingFields(finalized);
    return finalized;
  }

  private buildReplyContext(message: string, recentMessages: string[], details: Details): string {
    const lower = message.toLowerCase().trim();
    if (this.isOrderStatusQuestion(lower) && !details.flavors.length) {
      return "APPLICATION ORDER FACTS: There is no active order in the current conversation.\nNEXT ACTION DIRECTIVE: Answer that no current order has been placed.";
    }
    if (this.isSummaryRequest(lower) && !details.flavors.length) {
      return "APPLICATION ORDER FACTS: There is no active order in the current conversation.\nNEXT ACTION DIRECTIVE: Tell the customer there is no active order summary available yet.";
    }
    if (details.flavors.length) {
      return `APPLICATION ORDER FACTS:\n${this.formatOrderContext(details)}\n\nNEXT ACTION DIRECTIVE:\n${this.buildNextActionDirective(message, details)}\n\nThe application state above is the current merged order state. The current message itself always wins.`;
    }
    return recentMessages.length ? `CONVERSATION CONTEXT:\n${recentMessages.slice(-2).join("\n")}` : "CONVERSATION CONTEXT: none. Treat this as a fresh request.";
  }

  private buildNextActionDirective(message: string, details: Details): string {
    const lower = message.toLowerCase().trim();
    if (this.isOrderStatusQuestion(lower)) return "Answer order status only. Do not claim an order exists unless the application created it.";
    if (this.isSummaryRequest(lower)) {
      return details.missingFields.length
        ? `Provide the current order summary first. Then mention only the missing customer information: ${this.humanMissing(details.missingFields).join(", ")}. Do not ask for confirmation.`
        : "Provide the complete order summary. Then end exactly with: Please confirm if all the details above are correct. 😊";
    }
    if (/\b(total|total cost|how much is the total|how much total)\b/i.test(lower) && details.flavors.length) {
      return `Answer the total directly. Food total is ₱${details.totalAmount ?? 0}. Do not ask for confirmation unless there are no missing required fields.`;
    }
    if (/\b(how long|how much time|delivery time|when will it arrive|when can it arrive|how soon)\b/i.test(lower)) {
      return "Answer directly that preparation takes about 1 hour. Do not treat this as confirmation.";
    }
    if (details.deliveryMethod === "maxim") {
      const deliveryMissing = details.missingFields.filter((field) => ["address", "landmark", "contactNumber"].includes(field));
      if (deliveryMissing.length) return `Ask explicitly for these missing Maxim delivery details: ${this.humanMissing(deliveryMissing).join(", ")}. Do not ask for confirmation.`;
    }
    if (details.missingFields.length) return `Ask only for the missing required information: ${this.humanMissing(details.missingFields).join(", ")}. Do not present confirmation.`;
    return "All required order fields are present. Present the complete order summary and end exactly with: Please confirm if all the details above are correct. 😊";
  }

  private formatOrderContext(details: Details): string {
    return [
      `Flavors: ${details.flavors.map((x) => `${x.quantity} pcs ${x.name} (₱${x.unitPrice ?? 0} each)`).join(", ")}`,
      `Quantity: ${details.quantity ?? details.flavors.reduce((sum, x) => sum + x.quantity, 0)}`,
      `Total food amount: ₱${details.totalAmount ?? 0}`,
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

  private calculateMissingFields(details: Details): string[] {
    const missing: string[] = [];
    const quantity = Number(details.quantity ?? 0);
    const flavorQuantity = details.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (!details.flavors.length) missing.push("flavors");
    if (!quantity || flavorQuantity !== quantity) missing.push("quantity");
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

  private humanMissing(fields: string[]) {
    return fields.map((field) => field === "deliveryMethod"
      ? "delivery method (Pickup or Maxim)"
      : field === "paymentMethod"
        ? "payment method (GCash or COD)"
        : field === "address"
          ? "Address"
          : field === "landmark"
            ? "Landmark"
            : field === "contactNumber"
              ? "Contact #"
              : field === "quantity"
                ? "quantity"
                : field === "flavors"
                  ? "flavor"
                  : field === "minimumOrder"
                    ? "at least 10 pcs"
                    : field);
  }

  private isSummaryRequest(lower: string) { return /\b(summary|summarize|summarize my order|send.*summary|show.*summary)\b/i.test(lower); }
  private isOrderStatusQuestion(lower: string) { return /\b(did you place my order|have you placed my order|was my order placed|is my order placed|order status|has my order been placed)\b/i.test(lower); }
  private isConfirmationMessage(lower: string) { return /^(yes|yeah|yep|yes that's correct|yes thats correct|that's correct|thats correct|correct|confirmed|confirm|go ahead|proceed|okay proceed|yes all are correct|yes all correct|all are correct|everything is correct|place my order|place the order|order it)$/i.test(lower.trim()) || /\b(place my order|place the order|order it)\b/i.test(lower.trim()); }
  private inferIntent(message: string, details: Details): CustomerIntent {
    const lower = message.toLowerCase();
    if (this.isConfirmationMessage(lower)) return "order_confirmation";
    if (/\b(delivery fee|df)\b/.test(lower)) return "delivery_request";
    if (/\b(pickup|pick up)\b/.test(lower)) return "pickup_request";
    if (/\b(hm|how much|price|pila|tagpila|presyo)\b/.test(lower) && !details.flavors.length) return "pricing_question";
    if (details.flavors.length || /\border\b|\b\d+\s*(?:pcs?|pieces?)\b/.test(lower)) return "reservation";
    return "inquiry";
  }

  private normalizeFlavorName(value?: string) {
    const raw = this.optionalText(value);
    if (!raw) return "";
    const exact = CANONICAL_FLAVORS.find((name) => name.toLowerCase() === raw.toLowerCase());
    if (exact) return exact;
    const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();
    const aliases: Record<string, string> = {
      "pork with egg": "Pork Regular with Egg",
      "pork regular egg": "Pork Regular with Egg",
      "chicken egg": "Chicken with Egg",
      "beef egg": "Beef with Egg",
      "ham and cheese": "Ham & Cheese",
      "ham cheese": "Ham & Cheese",
      "ube": "Ube Empanada",
      "chocolate": "Choco"
    };
    return aliases[normalized] ?? raw.trim();
  }

  private normalizeIntent(value?: CustomerIntent): CustomerIntent {
    return value === "order_confirmation" || value === "reservation" || value === "delivery_request" || value === "pickup_request" || value === "pricing_question" || value === "inquiry"
      ? value
      : "inquiry";
  }

  private optionalText(value?: unknown) {
    if (typeof value !== "string") return undefined;
    const text = value.trim();
    return text || undefined;
  }

  private optionalPositiveNumber(value?: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  }

  private normalizePhone(value?: unknown) {
    if (typeof value !== "string") return undefined;
    const raw = value.trim();
    const digits = raw.replace(/\s+/g, "");
    if (/^09\d{9}$/.test(digits)) return digits;
    if (/^\+?63\d{10}$/.test(digits)) return digits;
    return raw || undefined;
  }

  private toFlavor(item: { name: string; quantity: number }): Flavor {
    const name = this.normalizeFlavorName(item.name);
    const quantity = Number(item.quantity);
    const unitPrice = Number(PRICES[name.toLowerCase()] ?? 0);
    return { name, quantity, unitPrice, subtotal: quantity * unitPrice };
  }

  private async generateCustomerReply(systemPrompt: string, message: string, context: string): Promise<string> {
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 160, num_ctx: 2048 },
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nAnswer ONLY the current customer message. The APPLICATION ORDER FACTS below are the merged current state and are authoritative. Answer questions directly. A summary request must return the current summary. If required fields are missing, never ask for confirmation. Do not output internal fields, JSON, or meta-commentary.`
        },
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

  private manilaDateOffset(days: number) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private cleanReply(reply: string) {
    return reply.replace(/^```(?:text|json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
}
