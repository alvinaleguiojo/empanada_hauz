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
    const response = await this.chat({
      model: this.model,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 160, num_ctx: 2048 },
      messages: [
        {
          role: "system",
          content: `You are the semantic order-action classifier for Empanada Hauz. Analyze the CURRENT CUSTOMER MESSAGE using the RECENT CONVERSATION and EXISTING DELIVERY DETAILS. Understand natural language semantically, including casual Messenger wording, incomplete phrases, Cebuano/English mixing, typos, shorthand, and paraphrases. Do not rely on exact keywords.

Return ONLY valid JSON with this schema:
{
  "orderAction": "new_order|modify_existing|status|summary|inquiry",
  "confidence": 0.0,
  "newOrderFlowActive": true|false,
  "reuseExistingDelivery": true|false
}

Rules:
- new_order means the customer wants to create a separate order, or has selected that they want a new/separate order after being asked about an existing order.
- modify_existing means the customer wants to change, add to, remove from, correct, or otherwise modify an existing order.
- status means asking where/how the existing order is or whether it has been placed.
- summary means asking to see the current order summary.
- inquiry means general business questions or messages that are not an order action.
- newOrderFlowActive=true when the recent conversation shows that the customer chose a new/separate order and the CURRENT CUSTOMER MESSAGE should continue building that new order. This stays true for follow-up item messages such as “choco 10 pcs” after the customer chose a new order.
- reuseExistingDelivery=true when the customer asks to use, reuse, keep, use again, copy, or retain the delivery/payment/contact details from the previous/current order for the order being built now. Examples include “please use the existing delivery details”, “same address and delivery”, “use my usual delivery info”, “same delivery details please”, “use the details from my last order”.
- If the customer asks to reuse existing delivery details, do not convert the request into modify_existing merely because an old database order exists. It normally applies to the new order being built.
- reuseExistingDelivery is only an interpretation flag. The application will decide whether usable previous details exist and will copy only verified database fields.
- For the first message “I want to order 15 pcs of beef with egg” when an active database order exists, return new_order with newOrderFlowActive=false. The application may ask whether to change the existing order or create a separate one.
- For “I want a new order please”, “new”, “new order”, “I want a new”, or natural paraphrases immediately after that routing question, return new_order with newOrderFlowActive=true.
- Never let the existence of an old database order turn a clearly new-order request into modify_existing.
- Do not decide pricing, required fields, ownership, confirmation, or database actions here.`
        },
        {
          role: "user",
          content: `ACTIVE DATABASE ORDER EXISTS: ${Boolean(context.hasActiveOrder)}\n\nEXISTING DELIVERY DETAILS:\ndeliveryMethod=${delivery.deliveryMethod ?? "none"}; address=${delivery.address ?? "none"}; landmark=${delivery.location ?? "none"}; contactNumber=${delivery.contactNumber ?? "none"}; paymentMethod=${delivery.paymentMethod ?? "none"}\n\nRECENT CONVERSATION:\n${recentMessages.length ? recentMessages.join("\n") : "none"}\n\nCURRENT CUSTOMER MESSAGE:\n${message}`
        }
      ]
    });

    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty order action");

    try {
      const parsed = JSON.parse(this.cleanJson(raw)) as Partial<AIOrderActionResult>;
      const orderAction = parsed.orderAction === "new_order"
        || parsed.orderAction === "modify_existing"
        || parsed.orderAction === "status"
        || parsed.orderAction === "summary"
        ? parsed.orderAction
        : "inquiry";
      const confidence = Number(parsed.confidence);
      return {
        orderAction,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        newOrderFlowActive: Boolean(parsed.newOrderFlowActive),
        reuseExistingDelivery: Boolean(parsed.reuseExistingDelivery)
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
