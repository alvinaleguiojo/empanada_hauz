import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AIOrderAction =
  | "new_order"
  | "modify_existing"
  | "status"
  | "summary"
  | "inquiry";

export interface AIOrderActionResult {
  orderAction: AIOrderAction;
  confidence: number;
  newOrderFlowActive: boolean;
  reuseExistingDelivery: boolean;
}

interface OllamaResponse {
  message?: { content?: string };
}

@Injectable()
export class AiOrderActionService {
  private readonly logger = new Logger(AiOrderActionService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_INTERPRET_MODEL", this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct"));
  }

  async analyze(
    message: string,
    context: {
      recentMessages?: string[];
      hasActiveOrder?: boolean;
      hasPendingNewOrder?: boolean;
      existingDeliveryDetails?: {
        deliveryMethod?: string | null;
        address?: string | null;
        location?: string | null;
        contactNumber?: string | null;
        paymentMethod?: string | null;
      };
    }
  ): Promise<AIOrderActionResult> {
    const recentMessages = (context.recentMessages ?? []).slice(-16);
    const delivery = context.existingDeliveryDetails ?? {};
    const hasActiveOrder = Boolean(context.hasActiveOrder);
    const hasPendingNewOrder = Boolean(context.hasPendingNewOrder);
    const response = await this.chat({
      model: this.model,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 192, num_ctx: 3072 },
      messages: [
        {
          role: "system",
          content: `You are the semantic action router for Empanada Hauz Messenger. Your job is to determine WHAT THE CUSTOMER WANTS TO DO NOW and return a structured action for the application. Interpret the CURRENT CUSTOMER MESSAGE semantically using the recent conversation and current order state. Never depend on exact keywords.

Understand natural language, typos, misspellings, shorthand, abbreviations, phonetic spellings, incomplete phrases, casual Messenger language, and Cebuano/English mixing. Resolve references such as "that", "same", "it", "this one", "again", and follow-up replies from the conversation context.

Return ONLY valid JSON:
{
  "orderAction": "new_order|modify_existing|status|summary|inquiry",
  "confidence": 0.0,
  "newOrderFlowActive": true|false,
  "reuseExistingDelivery": true|false
}

ACTION MEANINGS:
- new_order: start or continue a separate/new order.
- modify_existing: change an already-created database order, including changing quantity/items/date/time/delivery/payment/address/contact, cancelling an item, or otherwise correcting an existing order.
- status: ask whether an order exists, whether it was placed, or ask about its current status.
- summary: ask to see the current order summary/details.
- inquiry: general business question or anything that is not an order action.

CONFIRMATION:
- A customer accepting a complete order summary is an order-completion action. Treat natural-language acceptance as confirmation, including typos, misspellings, shorthand, or phonetic spellings.
- Examples include "yes", "okay", "sure", "go ahead", "please do", "correct", "confirm", "confir", or similar wording when the immediately preceding conversation contains a complete order summary awaiting confirmation.
- Do NOT invent confirmation from context alone. The CURRENT CUSTOMER MESSAGE must itself express acceptance.
- If the current message accepts the pending new order, return orderAction=new_order and newOrderFlowActive=true. The application will separately verify the structured confirmation result before creating the order.

NEW ORDER VS EXISTING ORDER:
- A request like "I want another order", "order 20 more", "can I get another batch", or similar means new_order.
- A request like "change it to 20", "make it pickup", "use GCash instead", "move it to Friday", "remove the chicken", "cancel the beef" means modify_existing when referring to an already-created database order.
- If a pending new order already exists, follow-up messages that provide or change details for that pending order remain new_order/new-order flow.

DELIVERY REUSE:
- reuseExistingDelivery=true only when the customer is clearly asking to copy/reuse/keep delivery details from a previous/current order for the separate new order.
- Do not infer payment reuse unless explicitly stated.

STATE RULES:
- If a pending new order exists, keep newOrderFlowActive=true while the customer completes or confirms it.
- If there is an active database order but no pending new order, do not treat a fresh new-order request as a modification merely because an old order exists.
- If there is an active database order and the customer clearly refers to changing that order, use modify_existing.
- If there is no active order and no pending new order, a message asking to create an order can start new_order flow.
- Do not decide pricing, required fields, order ownership, database validity, or whether an action is safe to execute. Those are application responsibilities.`
        },
        {
          role: "user",
          content: `ACTIVE DATABASE ORDER EXISTS: ${hasActiveOrder}\nPENDING NEW ORDER EXISTS: ${hasPendingNewOrder}\n\nEXISTING DELIVERY DETAILS:\ndeliveryMethod=${delivery.deliveryMethod ?? "none"}; address=${delivery.address ?? "none"}; landmark=${delivery.location ?? "none"}; contactNumber=${delivery.contactNumber ?? "none"}; paymentMethod=${delivery.paymentMethod ?? "none"}\n\nRECENT CONVERSATION:\n${recentMessages.length ? recentMessages.join("\n") : "none"}\n\nCURRENT CUSTOMER MESSAGE:\n${message}`
        }
      ]
    });

    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty order action");

    try {
      const parsed = JSON.parse(this.cleanJson(raw)) as Partial<AIOrderActionResult>;
      const requestedAction = parsed.orderAction === "new_order"
        || parsed.orderAction === "modify_existing"
        || parsed.orderAction === "status"
        || parsed.orderAction === "summary"
        ? parsed.orderAction
        : "inquiry";
      const requestedNewOrderFlow = Boolean(parsed.newOrderFlowActive);
      const reuseExistingDelivery = Boolean(parsed.reuseExistingDelivery) && hasPendingNewOrder;
      const newOrderFlowActive = hasPendingNewOrder
        ? requestedNewOrderFlow || reuseExistingDelivery || requestedAction === "new_order"
        : !hasActiveOrder && requestedAction === "new_order" && requestedNewOrderFlow;
      const orderAction = requestedAction;
      const confidence = Number(parsed.confidence);
      return {
        orderAction,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        newOrderFlowActive,
        reuseExistingDelivery
      };
    } catch (error) {
      this.logger.warn(`Order action JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
      return { orderAction: "inquiry", confidence: 0, newOrderFlowActive: false, reuseExistingDelivery: false };
    }
  }

  private async chat(body: Record<string, unknown>): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Ollama order-action request failed: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private cleanJson(raw: string) {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    return start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  }
}
