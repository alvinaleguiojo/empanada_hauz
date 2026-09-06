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
    const recentMessages = (context.recentMessages ?? []).slice(-12);
    const delivery = context.existingDeliveryDetails ?? {};
    const hasActiveOrder = Boolean(context.hasActiveOrder);
    const hasPendingNewOrder = Boolean(context.hasPendingNewOrder);
    const response = await this.chat({
      model: this.model,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 160, num_ctx: 2048 },
      messages: [
        {
          role: "system",
          content: `You are the semantic order-action classifier for Empanada Hauz. Analyze the CURRENT CUSTOMER MESSAGE using the RECENT CONVERSATION, CURRENT ORDER FLOW STATE, and EXISTING DELIVERY DETAILS. Understand natural language semantically, including casual Messenger wording, incomplete phrases, Cebuano/English mixing, typos, shorthand, and paraphrases. Do not rely on exact keywords.

Return ONLY valid JSON with this schema:
{
  "orderAction": "new_order|modify_existing|status|summary|inquiry",
  "confidence": 0.0,
  "newOrderFlowActive": true|false,
  "reuseExistingDelivery": true|false
}

Rules:
- new_order means the customer wants to create a separate order, or is continuing a separate/new order that has already been started in this conversation.
- A customer asking whether they can order something, such as "can I order 24 pcs of ham?", is a NEW order request, not a status question and not a modification of the previous database order.
- A customer stating a quantity and flavor to start or continue an order is a NEW order request unless they clearly say they are changing an existing database order.
- modify_existing means the customer wants to change, add to, remove from, correct, or otherwise modify an existing database order.
- status means asking where/how an existing order is or whether it has been placed, but NOT when the customer is starting or continuing a new order.
- summary means asking to see the current order summary.
- inquiry means general business questions or messages that are not an order action.
- newOrderFlowActive=true ONLY when CURRENT ORDER FLOW STATE says a pending new order already exists, OR when there is no active database order and the customer is starting a new order.
- If an active database order exists and there is NO pending new order, a fresh request to order a different item MUST return newOrderFlowActive=false. The application will ask whether the customer wants to change the existing order or place a separate new order.
- If there is a pending new order, keep newOrderFlowActive=true while the customer completes missing fields.
- reuseExistingDelivery=true ONLY when the customer asks to use, reuse, keep, use again, copy, or retain delivery details from a previous/current order for the NEW order being built. Delivery details means delivery method, address, landmark/location, and contact number. Do not infer or copy payment from this request.
- If reuseExistingDelivery=true but there is NO pending new order and an active database order exists, do not activate a new-order flow yet; the application must first establish that the customer wants a separate new order.
- Never let the existence of an old database order turn a clearly new-order request into modify_existing or status.
- Do not decide pricing, required fields, ownership, confirmation, or database actions here.`
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
      const reuseExistingDelivery = Boolean(parsed.reuseExistingDelivery) && hasPendingNewOrder;
      const requestedNewOrderFlow = Boolean(parsed.newOrderFlowActive);
      const newOrderFlowActive = hasPendingNewOrder
        ? requestedNewOrderFlow || reuseExistingDelivery
        : !hasActiveOrder && requestedAction === "new_order";
      const orderAction = reuseExistingDelivery ? "new_order" : requestedAction;
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
