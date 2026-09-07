import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult, CustomerIntent, DeliveryMethodValue } from "./types";
import type { AIOrderAction } from "./ai-order-action.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";

interface OllamaResponse { message?: { content?: string } }
type Details = AIIntentResult["details"];
type Flavor = Details["flavors"][number];

type CurrentInterpretation = {
  intent: CustomerIntent;
  startsNewConversation: boolean;
  flavorAction: "none" | "replace" | "add" | "remove";
  flavors: Array<{ name: string; quantity?: number }>;
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
  "ham with cheese": 25,
  "ham": 25,
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

const EXTRACTION_FORMAT = {
  type: "object",
  properties: {
    flavorAction: { type: "string", enum: ["none", "replace", "add", "remove"] },
    flavors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" }
        },
        required: ["name"],
        additionalProperties: false
      }
    },
    quantity: { type: "number" },
    location: { type: "string" },
    deliveryMethod: { type: "string", enum: ["pickup", "maxim"] },
    preferredTime: { type: "string" },
    deliveryDate: { type: "string" },
    address: { type: "string" },
    landmark: { type: "string" },
    contactNumber: { type: "string" },
    paymentMethod: { type: "string", enum: ["cod", "gcash"] }
  },
  required: ["flavorAction", "flavors"],
  additionalProperties: false
};

@Injectable()
export class AiService {
  protected readonly logger = new Logger(AiService.name);
  protected readonly baseUrl: string;
  protected readonly model: string;
  protected readonly interpretationModel: string;

  constructor(
    private readonly config: ConfigService,
    private readonly aiInstructionsService: AiInstructionsService
  ) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct");
    this.interpretationModel = this.config.get<string>("OLLAMA_INTERPRET_MODEL", "qwen2.5:0.5b");
  }

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[]; activeOrderState?: Details }): Promise<AIIntentResult> {
    if (this.isOutOfScopeRequest(message)) {
      this.logger.log(`AI request rejected as out-of-scope: ${JSON.stringify(message)}`);
      return {
        intent: "inquiry",
        confidence: 1,
        details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
        suggestedReply: "I’m here to help with Empanada Hauz orders, prices, pickup, delivery, payments, and order status. 😊",
        source: "ollama"
      };
    }

    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const recentMessages = (context?.recentMessages ?? []).slice(-16);
    const applicationAction = this.extractApplicationAction(recentMessages);
    const current = await this.extractCurrentOrderFields(message, now, recentMessages, context?.activeOrderState);
    current.intent = this.intentFromApplicationAction(applicationAction);
    current.confirmed = applicationAction === "confirm";
    current.startsNewConversation = applicationAction === "inquiry" && !context?.activeOrderState;

    const details = this.mergeOrderState(context?.activeOrderState, current);
    const systemPrompt = await this.aiInstructionsService.getActivePromptBlock();
    const replyContext = this.buildReplyContext(message, recentMessages, details, applicationAction);
    const suggestedReply = await this.generateCustomerReply(systemPrompt, message, replyContext);
    const confidence = current.flavors.length || details.flavors.length || current.confirmed || applicationAction !== "inquiry" || Boolean(details.deliveryMethod) || Boolean(details.paymentMethod) ? 1 : 0;
    return {
      intent: current.intent,
      confidence,
      details,
      suggestedReply,
      source: "ollama"
    };
  }

  private extractApplicationAction(recentMessages: string[]): AIOrderAction {
    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
      const match = recentMessages[index].match(/^APPLICATION AI ORDER ACTION:\s*(new_order|modify_existing|cancel_existing|status|summary|inquiry|confirm)\b/i);
      if (match) return match[1].toLowerCase() as AIOrderAction;
    }
    return "inquiry";
  }

  private intentFromApplicationAction(action: AIOrderAction): CustomerIntent {
    switch (action) {
      case "confirm": return "order_confirmation";
      case "new_order": return "reservation";
      case "modify_existing": return "reservation";
      case "cancel_existing": return "reservation";
      case "status": return "inquiry";
      case "summary": return "inquiry";
      case "inquiry": return "inquiry";
    }
  }

  async generateOrderResultReply(outcome: "created" | "failed", orderNumber?: string): Promise<string> {
    const status = outcome === "created"
      ? `APPLICATION RESULT: The application successfully created the customer's confirmed order.${orderNumber ? ` Order number: ${orderNumber}.` : ""}`
      : "APPLICATION RESULT: The application could not create the customer's confirmed order.";
    const systemPrompt = await this.aiInstructionsService.getActivePromptBlock();
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user", content: status }
    ];
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 96, num_ctx: 1536 },
      messages
    }, "Ollama order result reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty order result reply");
    return this.cleanReply(reply);
  }

  private async extractCurrentOrderFields(message: string, now: string, recentMessages: string[], activeOrderState?: Details): Promise<CurrentInterpretation> {
    const conversationContext = recentMessages.length
      ? recentMessages.join("\n")
      : "none";
    const activeStateContext = activeOrderState
      ? this.formatOrderContext(activeOrderState)
      : "none";
    const systemPrompt = await this.aiInstructionsService.getActivePromptBlock();
    const userContent = [
      `CURRENT DATE/TIME IN ASIA/MANILA: ${now}`,
      `RECENT CONVERSATION: ${conversationContext}`,
      `CURRENT APPLICATION ORDER STATE: ${activeStateContext}`,
      `CURRENT CUSTOMER MESSAGE: ${message}`
    ].join("\n\n");
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user", content: userContent }
    ];
    const response = await this.ollamaChat({
      model: this.interpretationModel,
      stream: false,
      think: false,
      format: EXTRACTION_FORMAT,
      options: { temperature: 0.1, num_predict: 384, num_ctx: 4096 },
      messages
    }, "Ollama order-field extraction failed");

    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty order-field extraction");
    return this.parseCurrentInterpretation(raw);
  }

  private parseCurrentInterpretation(raw: string): CurrentInterpretation {
    const candidates = [this.cleanReply(raw)];
    const extracted = this.extractJsonObject(raw);
    if (extracted && extracted !== candidates[0]) candidates.push(extracted);

    for (const candidate of candidates) {
      try {
        return this.normalizeCurrentInterpretation(JSON.parse(candidate) as Partial<CurrentInterpretation>);
      } catch {
        const repaired = this.repairTruncatedJson(candidate);
        if (!repaired || repaired === candidate) continue;
        try {
          return this.normalizeCurrentInterpretation(JSON.parse(repaired) as Partial<CurrentInterpretation>);
        } catch {
          // Continue to next candidate.
        }
      }
    }

    this.logger.error("Qwen returned invalid structured order-field extraction");
    throw new Error("Qwen returned invalid order-field extraction JSON");
  }

  private normalizeCurrentInterpretation(parsed: Partial<CurrentInterpretation>): CurrentInterpretation {
    return {
      intent: "inquiry",
      startsNewConversation: false,
      flavorAction: parsed.flavorAction === "replace" || parsed.flavorAction === "add" || parsed.flavorAction === "remove" ? parsed.flavorAction : "none",
      flavors: Array.isArray(parsed.flavors)
        ? parsed.flavors
            .map((item) => ({ name: this.normalizeFlavorName(item?.name), quantity: this.optionalPositiveNumber(item?.quantity) }))
            .filter((item) => item.name)
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
      confirmed: false
    };
  }

  private extractJsonObject(raw: string) {
    const text = this.cleanReply(raw);
    const start = text.indexOf("{");
    if (start < 0) return undefined;
    const end = text.lastIndexOf("}");
    return text.slice(start, end >= start ? end + 1 : text.length).trim();
  }

  private repairTruncatedJson(value: string) {
    const text = value.trim();
    if (!text.startsWith("{")) return undefined;

    let best: string | undefined;
    for (let end = text.length; end >= Math.max(2, text.length - 500); end -= 1) {
      const prefix = text.slice(0, end).trimEnd();
      const repaired = this.closeJson(prefix);
      if (!repaired) continue;
      try {
        JSON.parse(repaired);
        best = repaired;
        break;
      } catch {
        // Keep trimming until the last complete property can be parsed.
      }
    }
    return best;
  }

  private closeJson(value: string) {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (const char of value) {
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') inString = true;
      else if (char === "{" || char === "[") stack.push(char);
      else if (char === "}" || char === "]") {
        const expected = char === "}" ? "{" : "[";
        if (stack.at(-1) !== expected) return undefined;
        stack.pop();
      }
    }

    let result = value.trimEnd();
    if (inString) result += '"';
    while (stack.length) {
      const opener = stack.pop();
      result += opener === "{" ? "}" : "]";
    }
    return result;
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
      merged.flavors = current.flavors.map((item) => this.toFlavor({ name: item.name, quantity: item.quantity ?? 0 }));
    } else if (current.flavorAction === "add" && current.flavors.length) {
      merged.flavors = this.mergeFlavorAdds(base.flavors ?? [], current.flavors);
    } else if (current.flavorAction === "remove" && current.flavors.length) {
      merged.flavors = this.removeFlavors(base.flavors ?? [], current.flavors);
    } else if (current.flavors.length) {
      merged.flavors = current.flavors.map((item) => this.toFlavor({ name: item.name, quantity: item.quantity ?? 0 }));
    }

    for (const field of ["quantity", "location", "deliveryMethod", "preferredTime", "deliveryDate", "address", "landmark", "contactNumber", "paymentMethod"] as const) {
      const value = current[field];
      if (value !== undefined && value !== "") (merged as Record<string, unknown>)[field] = value;
    }

    if (current.quantity !== undefined && merged.flavors.length === 1 && current.flavorAction !== "add" && current.flavorAction !== "remove") {
      const only = merged.flavors[0];
      merged.flavors = [{ ...only, quantity: current.quantity, subtotal: current.quantity * Number(only.unitPrice ?? 0) }];
      merged.quantity = current.quantity;
    } else if (merged.flavors.length && current.flavorAction !== "add" && current.flavorAction !== "remove") {
      const hasPositiveFlavorQuantity = merged.flavors.some((item) => Number(item.quantity ?? 0) > 0);
      if (hasPositiveFlavorQuantity || current.flavors.some((item) => item.quantity !== undefined)) {
        merged.quantity = merged.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      }
    }

    if (current.confirmed) merged.confirmed = true;
    return merged;
  }

  private mergeFlavorAdds(existing: Flavor[], additions: Array<{ name: string; quantity?: number }>): Flavor[] {
    const map = new Map(existing.map((item) => [item.name.toLowerCase(), { ...item }]));
    for (const addition of additions) {
      const key = addition.name.toLowerCase();
      const current = map.get(key);
      const quantity = Number(current?.quantity ?? 0) + Number(addition.quantity ?? 0);
      const unitPrice = current?.unitPrice ?? PRICES[key] ?? 0;
      map.set(key, { name: addition.name, quantity, unitPrice, subtotal: quantity * unitPrice });
    }
    return [...map.values()];
  }

  private removeFlavors(existing: Flavor[], removals: Array<{ name: string; quantity?: number }>): Flavor[] {
    const map = new Map(existing.map((item) => [item.name.toLowerCase(), { ...item }]));
    for (const removal of removals) {
      const key = removal.name.toLowerCase();
      const current = map.get(key);
      if (!current) continue;
      const quantity = Number(current.quantity) - Number(removal.quantity ?? 0);
      if (quantity <= 0) map.delete(key);
      else map.set(key, { ...current, quantity, subtotal: quantity * Number(current.unitPrice ?? 0) });
    }
    return [...map.values()];
  }

  private finalizeOrderState(details: Details): Details {
    const flavors = (details.flavors ?? []).map((item) => {
      const name = this.normalizeFlavorName(item.name);
      const unitPrice = Number(item.unitPrice ?? PRICES[name.toLowerCase()] ?? 0);
      const quantity = Math.max(0, Number(item.quantity ?? 0));
      return { name, quantity, unitPrice, subtotal: quantity * unitPrice };
    }).filter((item) => item.name);
    const quantity = flavors.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = flavors.reduce((sum, item) => sum + Number(item.subtotal ?? item.quantity * Number(item.unitPrice ?? 0)), 0);
    const finalized: Details = { ...details, flavors, quantity: quantity || details.quantity, totalAmount, missingFields: [] };
    finalized.missingFields = this.calculateMissingFields(finalized);
    return finalized;
  }

  private buildReplyContext(message: string, recentMessages: string[], details: Details, action: AIOrderAction): string {
    const lines = [
      `APPLICATION ACTION: ${action}`,
      `CURRENT CUSTOMER MESSAGE: ${message}`,
      `ORDER STATE: ${this.formatOrderContext(details)}`,
      `RECENT CONVERSATION: ${recentMessages.slice(-16).join("\n") || "none"}`
    ];
    return lines.join("\n\n");
  }

  private formatOrderContext(details: Details): string {
    return [
      `Flavors: ${details.flavors.map((x) => `${x.quantity > 0 ? `${x.quantity} pcs` : "quantity pending"} ${x.name} (₱${x.unitPrice ?? 0} each)`).join(", ")}`,
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
      `Placement status: ${details.missingFields.length === 0 && details.flavors.some((x) => x.quantity > 0) ? "READY only after explicit confirmation" : "NOT READY"}`
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

  private isBusinessRelatedMessage(message: string) {
    return /\b(?:empanada|order|orders|pork|chicken|beef|ube|mango|choco|bacon|ham|cheese|pcs?|pieces?|gcash|cod|cash|pickup|pick\s*up|maxim|delivery|deliver|address|landmark|contact|payment|price|pricing|cost|how much|hm|df|status|summary|book|reserve|buy|availab|available|discount|promo|reschedule|rescheduled|move|moved|moving|postpone|postponed|advance|change|changed|today|tomorrow|yesterday)\b/i.test(message);
  }

  private isOutOfScopeRequest(message: string) {
    const lower = message.trim().toLowerCase();
    if (!lower) return false;
    if (this.isBusinessRelatedMessage(message)) return false;
    if (/^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|thanks|thank you|okay|ok|yes|no|sure|alright|bye|goodbye)[!.\s]*$/i.test(lower)) return false;
    return /\b(?:javascript|typescript|python|java|c\+\+|c#|ruby|php|golang|rust|html|css|sql|react|angular|vue|node(?:\.js)?|coding|code|programming|program|script|software|api|database|algorithm|homework|essay|assignment|write\s+(?:a|an)\s+(?:code|program|script)|debug|debugging|developer|programmer)\b/i.test(lower);
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
      "ham": "Ham & Cheese",
      "ham and cheese": "Ham & Cheese",
      "ham cheese": "Ham & Cheese",
      "ham with cheese": "Ham & Cheese",
      "ube": "Ube Empanada",
      "chocolate": "Choco"
    };
    return aliases[normalized] ?? raw.trim();
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
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user", content: `${context}\n\nCURRENT CUSTOMER MESSAGE: ${message}` }
    ];
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.15, num_predict: 320, num_ctx: 4096 },
      messages
    }, "Ollama customer reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty customer reply");
    return this.cleanReply(reply);
  }

  private cleanReply(value: string) {
    return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  private async ollamaChat(body: Record<string, unknown>, errorMessage: string): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`${errorMessage}: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}
