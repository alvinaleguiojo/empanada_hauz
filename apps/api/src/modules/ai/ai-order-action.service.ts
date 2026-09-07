import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AIOrderAction =
  | "new_order"
  | "modify_existing"
  | "cancel_existing"
  | "status"
  | "summary"
  | "inquiry"
  | "confirm";

export interface AIOrderActionResult {
  orderAction: AIOrderAction;
  confidence: number;
  newOrderFlowActive: boolean;
  reuseExistingDelivery: boolean;
  referencedOrderDate?: string;
  requestedDeliveryDate?: string;
  requestedDeliveryTime?: string;
}

interface OllamaResponse { message?: { content?: string } }

@Injectable()
export class AiOrderActionService {
  private readonly logger = new Logger(AiOrderActionService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_INTERPRET_MODEL", this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct"));
  }

  async analyze(message: string, context: { recentMessages?: string[]; hasActiveOrder?: boolean; hasPendingNewOrder?: boolean; existingDeliveryDetails?: { deliveryMethod?: string | null; address?: string | null; location?: string | null; contactNumber?: string | null; paymentMethod?: string | null; preferredSchedule?: string | null } }): Promise<AIOrderActionResult> {
    const recentMessages = (context.recentMessages ?? []).slice(-16);
    const delivery = context.existingDeliveryDetails ?? {};
    const hasActiveOrder = Boolean(context.hasActiveOrder);
    const hasPendingNewOrder = Boolean(context.hasPendingNewOrder);
    const response = await this.chat({
      model: this.model, stream: false, think: false, format: "json",
      options: { temperature: 0, num_predict: 256, num_ctx: 3072 },
      messages: [
        { role: "system", content: `You are the semantic action router for Empanada Hauz Messenger. Determine WHAT THE CUSTOMER WANTS TO DO NOW from the CURRENT CUSTOMER MESSAGE plus recent conversation and current order state. Never depend on exact keywords.

Understand natural language, typos, misspellings, shorthand, abbreviations, phonetic spellings, incomplete phrases, casual Messenger wording, and Cebuano/English mixing. Resolve references such as "that", "same", "it", "this one", "again", and follow-up replies from conversation context.

Return ONLY valid JSON with this shape:
{"orderAction":"new_order|modify_existing|cancel_existing|status|summary|inquiry|confirm","confidence":0.0,"newOrderFlowActive":true,"reuseExistingDelivery":false,"referencedOrderDate":"YYYY-MM-DD or empty","requestedDeliveryDate":"YYYY-MM-DD or empty","requestedDeliveryTime":"HH:MM or empty"}

DATE/TIME REFERENCE EXTRACTION:
- When modifying an existing order, identify the date of the existing order being referred to as referencedOrderDate when the customer states it or clearly frames it as the current/original schedule.
- If the customer states a new/target date, return it as requestedDeliveryDate.
- If the customer states a new/target time, return it as requestedDeliveryTime.
- For a relative date such as today, tomorrow, next Monday, or next week, resolve it using the current date/time supplied in context.
- If the customer says something like "move my order on Nov 1 to today", the first date is referencedOrderDate and "today" is requestedDeliveryDate.
- If the customer says something like "move my order schedule today to tomorrow", treat today as referencedOrderDate and tomorrow as requestedDeliveryDate, because the customer is describing the existing schedule and the desired new schedule.
- If the customer says something like "I want to move my order today to tomorrow can you check it please", treat today as referencedOrderDate and tomorrow as requestedDeliveryDate.
- Never put the old/source date into requestedDeliveryDate.
- These date/time fields are for application routing only; do not invent values when the customer did not provide or clearly imply them.

ACTION MEANINGS:
- new_order: start or continue a separate/new order.
- modify_existing: change details of an already-created database order, such as quantity/items/date/time/delivery/payment/address/contact, remove one item, or reschedule/move/postpone/bring forward an existing order.
- cancel_existing: cancel an entire already-created database order.
- status: ask whether an order exists, whether it was placed, or its current status. A request to change, move, reschedule, postpone, or shift an existing order is NOT status, even if the customer also asks the assistant to check the order.
- summary: ask to see current or previous order summary/details.
- inquiry: general business question or anything that is not an order action.
- confirm: explicitly accept/approve the immediately preceding complete pending new-order summary so the application can validate and create it.

EXISTING-ORDER CHANGE VS NEW ORDER:
- If an active database order exists and the customer asks to change, move, reschedule, postpone, advance, update, switch, or otherwise alter that existing order, choose modify_existing.
- A request about changing the date or time of an existing reservation/order is modify_existing, even when the customer says "reservation", "book", "move it", "make it today", or similar wording.
- A relative-date request such as moving an existing order from a prior date to today, tomorrow, next week, or another date is a modification when it refers to the existing order.
- If the customer mentions both an existing/source date and a new/target date, treat the source date as the date of the existing order being referenced and the target date as the requested new delivery date.
- Requests such as "move my order schedule today to tomorrow" and "move my order today to tomorrow" are modifications, not status checks and not new orders.
- Do NOT choose new_order merely because the customer uses words like "reservation", "reserve", "book", "order", or describes a desired new date/time. Determine whether the customer is referring to an existing order or requesting a separate one.
- A request for another/separate order means new_order.
- Follow-up details for a pending new order remain new_order.

CANCELLATION:
- Choose cancel_existing when the current message clearly asks to cancel/stop the whole existing order.
- Understand cancellation semantically, including typos, misspellings, shorthand, phonetic spellings, and casual wording. Do not rely on a fixed phrase list.
- Do not choose cancel_existing when the customer only wants one item removed or an order detail changed; use modify_existing.
- Do not choose cancel_existing for a pending new-order draft.

CONFIRMATION:
- Choose confirm only when the current message itself clearly accepts the immediately preceding complete pending new-order summary.
- Accept natural language, shorthand, typos, misspellings, phonetic spellings, and casual wording.
- Do not choose confirm for a question, rejection, change request, summary request, new-order request, or ambiguous message.

DELIVERY REUSE:
- reuseExistingDelivery=true only when the customer clearly asks to keep/copy previous/current delivery details for a separate new order.
- Never infer payment reuse.

STATE RULES:
- If a pending new order exists, keep newOrderFlowActive=true for its completion, changes, or confirmation.
- confirm for a pending new order means newOrderFlowActive=true.
- Do not treat a fresh new-order request as a modification just because an old order exists.
- Do not decide pricing, required fields, ownership, database validity, cancellation eligibility, or execution safety. Those are application responsibilities.` },
        { role: "user", content: `ACTIVE DATABASE ORDER EXISTS: ${hasActiveOrder}\nPENDING NEW ORDER EXISTS: ${hasPendingNewOrder}\nCURRENT DATE/TIME IN ASIA/MANILA: ${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())}\n\nEXISTING ORDER DETAILS:\ndeliveryMethod=${delivery.deliveryMethod ?? "none"}; address=${delivery.address ?? "none"}; landmark=${delivery.location ?? "none"}; contactNumber=${delivery.contactNumber ?? "none"}; paymentMethod=${delivery.paymentMethod ?? "none"}; scheduledAt=${delivery.preferredSchedule ?? "none"}\n\nRECENT CONVERSATION:\n${recentMessages.length ? recentMessages.join("\n") : "none"}\n\nCURRENT CUSTOMER MESSAGE:\n${message}` }
      ]
    });
    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty order action");
    try {
      const parsed = JSON.parse(this.cleanJson(raw)) as Partial<AIOrderActionResult>;
      const requestedAction: AIOrderAction = parsed.orderAction === "new_order" || parsed.orderAction === "modify_existing" || parsed.orderAction === "cancel_existing" || parsed.orderAction === "status" || parsed.orderAction === "summary" || parsed.orderAction === "confirm" ? parsed.orderAction : "inquiry";
      const requestedNewOrderFlow = Boolean(parsed.newOrderFlowActive);
      const reuseExistingDelivery = Boolean(parsed.reuseExistingDelivery) && hasPendingNewOrder;
      const newOrderFlowActive = hasPendingNewOrder ? requestedNewOrderFlow || reuseExistingDelivery || requestedAction === "new_order" || requestedAction === "confirm" : !hasActiveOrder && requestedAction === "new_order" && requestedNewOrderFlow;
      const confidence = Number(parsed.confidence);
      return {
        orderAction: requestedAction,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        newOrderFlowActive,
        reuseExistingDelivery,
        referencedOrderDate: typeof parsed.referencedOrderDate === "string" && parsed.referencedOrderDate.trim() ? parsed.referencedOrderDate.trim() : undefined,
        requestedDeliveryDate: typeof parsed.requestedDeliveryDate === "string" && parsed.requestedDeliveryDate.trim() ? parsed.requestedDeliveryDate.trim() : undefined,
        requestedDeliveryTime: typeof parsed.requestedDeliveryTime === "string" && parsed.requestedDeliveryTime.trim() ? parsed.requestedDeliveryTime.trim() : undefined
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
      const response = await fetch(`${this.baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Ollama order-action request failed: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally { clearTimeout(timeout); }
  }

  private cleanJson(raw: string) {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    return start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  }
}
