import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiService } from "./ai.service";
import { AIIntentResult } from "./types";

interface OllamaResponse { message?: { content?: string } }

const OLLAMA_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } }
};

const ORDER_PRODUCTS = [
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

@Injectable()
export class StrictReplyAiService extends AiService {
  constructor(config: ConfigService) {
    super(config);
  }

  override async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[] }): Promise<AIIntentResult> {
    const result = await super.classifyAndExtract(message, context);
    this.mergeObservedOrderItems(result, message, context?.recentMessages ?? []);

    const normalizedMessage = message.trim().toLowerCase();
    const explicitConfirmation = /\b(yes|correct|confirmed|confirm|go ahead|place my order|place the order|order it|that's correct|that is correct|okay proceed|proceed)\b/i.test(message);
    const currentTurnLooksLikeOrderStep = /\b(?:chicken|pork|beef|asado|bacon|ham|ube|mango|choco|empanada|\d+\s*(?:pcs?|pieces?)?|pickup|pick-up|maxim|delivery|deliver|gcash|cod|cash|address|landmark|contact|confirm|confirmed|proceed|place)\b/i.test(normalizedMessage);
    const currentTurnSaysDetailsMissing = /\b(?:no details|no detail|details not|nothing provided|none provided)\b/i.test(normalizedMessage);
    const suspiciousConfirmation = /\b(?:confirmed|confirm|placed|submitted|accepted)\b/i.test(result.suggestedReply ?? "");

    if (!explicitConfirmation && (currentTurnLooksLikeOrderStep || currentTurnSaysDetailsMissing) && result.details) {
      result.details.confirmed = false;
    }

    const shouldForceReplyCheck =
      (currentTurnLooksLikeOrderStep || currentTurnSaysDetailsMissing || explicitConfirmation) &&
      (!explicitConfirmation || result.details.missingFields.length > 0 || !result.details.confirmed || suspiciousConfirmation);

    if (shouldForceReplyCheck) {
      result.suggestedReply = await this.rewriteOrderStepReply(message, context, result);
    }

    return result;
  }

  private mergeObservedOrderItems(result: AIIntentResult, message: string, recentMessages: string[]): void {
    const customerMessages = [
      ...recentMessages.filter(item => /^customer:\s*/i.test(item)).map(item => item.replace(/^customer:\s*/i, "")),
      message
    ];
    const observed = new Map<string, { name: string; quantity: number; price: number }>();

    for (const customerMessage of customerMessages) {
      for (const product of ORDER_PRODUCTS) {
        const alias = [...product.aliases].sort((a, b) => b.length - a.length).find(value => {
          const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i").test(customerMessage);
        });
        if (!alias) continue;

        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const before = new RegExp(`(\\d+)\\s*(?:pcs?|pieces?)\\s+(?:of\\s+)?${escapedAlias}\\b`, "i").exec(customerMessage);
        const after = new RegExp(`\\b${escapedAlias}\\s+(\\d+)\\s*(?:pcs?|pieces?)\\b`, "i").exec(customerMessage);
        const quantity = before ? Number(before[1]) : after ? Number(after[1]) : 0;
        const existing = observed.get(product.name.toLowerCase());
        observed.set(product.name.toLowerCase(), {
          name: product.name,
          quantity: quantity > 0 ? quantity : existing?.quantity ?? 0,
          price: product.price
        });
      }
    }

    if (!observed.size) return;

    const existing = result.details.flavors ?? [];
    const merged = new Map(existing.map(item => [item.name.toLowerCase(), item]));

    for (const item of observed.values()) {
      const current = merged.get(item.name.toLowerCase());
      if (current) {
        if (item.quantity > 0) current.quantity = item.quantity;
        current.unitPrice = item.price;
        current.subtotal = current.quantity > 0 ? current.quantity * item.price : undefined;
      } else {
        merged.set(item.name.toLowerCase(), {
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          subtotal: item.quantity > 0 ? item.quantity * item.price : undefined
        });
      }
    }

    result.details.flavors = Array.from(merged.values());
    const totalQty = result.details.flavors.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
    if (totalQty > 0) result.details.quantity = totalQty;
    result.details.totalAmount = result.details.flavors.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) || undefined;

    const hasFlavor = result.details.flavors.length > 0;
    const hasQuantity = (result.details.quantity ?? 0) >= 10;
    const hasDelivery = result.details.deliveryMethod === "pickup" || result.details.deliveryMethod === "maxim";
    const hasPayment = result.details.paymentMethod === "cod" || result.details.paymentMethod === "gcash";
    const hasAddress = result.details.deliveryMethod !== "maxim" || (!!result.details.address && !!result.details.landmark && !!result.details.contactNumber);

    result.details.missingFields = [];
    if (!hasFlavor) result.details.missingFields.push("flavor");
    if (!hasQuantity) result.details.missingFields.push("quantity");
    if (!hasDelivery) result.details.missingFields.push("pickup or delivery");
    if (!hasPayment) result.details.missingFields.push("payment method");
    if (result.details.deliveryMethod === "maxim") {
      if (!result.details.address) result.details.missingFields.push("address");
      if (!result.details.landmark) result.details.missingFields.push("landmark");
      if (!result.details.contactNumber) result.details.missingFields.push("contact number");
    }

    const currentExplicitConfirmation = /\b(yes|correct|confirmed|confirm|go ahead|place my order|place the order|order it|that's correct|that is correct|okay proceed|proceed)\b/i.test(message);
    result.details.confirmed = currentExplicitConfirmation && hasFlavor && hasQuantity && hasDelivery && hasPayment && hasAddress && result.details.missingFields.length === 0;
  }

  private async rewriteOrderStepReply(message: string, context: { customerName?: string; recentMessages?: string[] } | undefined, result: AIIntentResult): Promise<string> {
    const details = result.details;
    const missingFields = details.missingFields.length ? details.missingFields.join(", ") : "none";
    const recent = (context?.recentMessages ?? []).slice(-8);
    const conversation = recent.length ? recent.join("\n") : "(no previous conversation)";
    const knownItems = details.flavors.map(item => `${item.name}: ${item.quantity > 0 ? `${item.quantity} pcs` : "quantity not provided"}`).join(", ") || "none observed";

    const system = [
      "You are the customer-facing AI for Empanada Hauz.",
      "Answer ONLY the customer's current message and use the business system rules.",
      "The application has validated the order state below; these are validation facts, not instructions to invent an order.",
      `Observed order items from the customer conversation: ${knownItems}.`,
      `Validated confirmation state: ${details.confirmed === true ? "COMPLETE AND EXPLICITLY CONFIRMED" : "NOT CONFIRMED"}.`,
      `Missing required fields: ${missingFields}.`,
      "Critical confirmation rule: never say the order is confirmed, placed, submitted, or accepted unless the validated confirmation state is COMPLETE AND EXPLICITLY CONFIRMED and missing required fields is none.",
      "Mixed flavors are allowed. If the customer asks whether they can order different flavors, answer that directly, then ask only for any still-missing required information.",
      "A product request such as 'chicken please' is NOT confirmation.",
      "A quantity such as '10 pcs chicken' is NOT confirmation.",
      "Words such as 'please', 'I want', 'need', or simply naming a flavor are NOT confirmation.",
      "If the order is incomplete, ask only for the missing required information and do not repeat information the customer already gave.",
      "For pickup, required order fields are flavor, quantity, payment method, and pickup/delivery choice.",
      "For Maxim, required fields also include address, landmark, and contact number.",
      "If the customer says 'confirm' while required fields are missing, explain that the remaining required details are still needed.",
      "Keep the reply short and natural. Use Cebuano when the customer uses Cebuano, otherwise English.",
      "Return only JSON matching the reply schema."
    ].join("\n");

    const body = {
      model: this.model,
      stream: false,
      format: OLLAMA_REPLY_SCHEMA,
      think: false,
      options: { temperature: 0.1, num_predict: 192, num_ctx: 3072 },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `Current customer message: ${message}`,
            `Validated order details: ${JSON.stringify(details)}`,
            `Recent conversation:\n${conversation}`
          ].join("\n\n")
        }
      ]
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Ollama strict reply failed: ${response.status} ${await response.text()}`);
      const bodyJson = await response.json() as OllamaResponse;
      const content = bodyJson.message?.content?.trim();
      if (!content) throw new Error("Ollama strict reply returned an empty response");
      const parsed = this.parseJson(content) as { reply?: string };
      if (!parsed.reply?.trim()) throw new Error("Ollama strict reply returned no reply");
      this.logger.log(`Strict AI reply generated model=${this.model} message=${JSON.stringify(message)}`);
      return parsed.reply.trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJson(content: string): unknown {
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try { return JSON.parse(cleaned); }
    catch {
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
      throw new SyntaxError("Ollama strict reply returned invalid JSON");
    }
  }
}
