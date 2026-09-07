import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import type { AIIntentResult } from "../ai/types";
import type { AIOrderAction, AIOrderActionResult } from "../ai/ai-order-action.service";
import { MessengerSingleCallAiService } from "./messenger-single-call-ai.service";

const SEMANTIC_GUARDRAILS = `APPLICATION SEMANTIC GUARDRAILS (authoritative application policy):
- The CURRENT CUSTOMER MESSAGE is authoritative for the current turn.
- Interpret the customer's communicative goal semantically. Do not classify a request based only on the existence of an active database order.
- A customer who is asking to order, buy, get, reserve, or start a new order is expressing a new-order request unless the CURRENT CUSTOMER MESSAGE semantically refers to an already-created order and asks to change, reschedule, cancel, or check that existing order.
- An active database order does not by itself turn a fresh order request into an existing-order modification.
- When the CURRENT CUSTOMER MESSAGE introduces new item/flavor/quantity information without a semantic reference to an already-created order, treat those details as the requested new order.
- A request to change an existing order must contain a semantic reference to that existing order or its schedule; do not infer such a reference merely because an active order exists in application state.
- Never infer referencedOrderDate merely from an earlier order schedule. referencedOrderDate is allowed only when the CURRENT CUSTOMER MESSAGE semantically refers to the existing order or its schedule.
- A customer asking for clarification about something the assistant previously said is an inquiry/clarification, not automatically an order-status request.
- For a fresh new-order request, do not revive or copy a stale pending draft when the CURRENT CUSTOMER MESSAGE supplies different item details. Current-turn details take precedence over stale conversation state.
- For CURRENT-TURN EXTRACTION, the current customer message is the source of truth for explicitly supplied order fields. Historical flavor, quantity, delivery date, payment, or other order values are context only and must not overwrite current-turn values.
- If the CURRENT CUSTOMER MESSAGE explicitly supplies a flavor and/or quantity, output those current values in details.flavors/details.quantity even when conversation history contains different values.
- If the CURRENT CUSTOMER MESSAGE does not supply a flavor or quantity, do not invent one by copying an older order unless the customer is clearly referring to the pending new order with a contextual continuation.
- Do not copy an old deliveryDate or preferredTime into the current turn unless the customer clearly refers to the pending new-order schedule or explicitly asks to reuse/keep it.
- A separate new-order request should start from the customer's current requested items. Existing database-order items are never the new-order items unless the customer explicitly asks to copy/reuse them.
- CUSTOMER-FACING REPLY STYLE: replies must sound like a normal friendly Messenger conversation, not a system message, diagnostic log, template, or workflow trace.
- Never mention pending drafts, application state, validation, MCP, internal actions, routers, JSON, required fields, or implementation details.
- Never expose internal field names such as deliveryMethod, paymentMethod, referencedOrderDate, missing, or confirmed.
- When the customer says they want to place/start a new order but has not supplied flavor or quantity, acknowledge the request and naturally ask what flavor and how many pieces they want. Do not ask whether they want to proceed, because they already said they want to order.
- Do not list the entire menu when the customer only asks to place/start an order. List menu options only when the customer asks for the menu, available flavors, choices, or prices.
- When listing menu options, use readable Messenger formatting: one flavor per line, with the price clearly shown. Avoid one long comma-separated paragraph.
- Prefer short paragraphs, natural punctuation, and line breaks. Keep replies easy to scan on a phone.
- Do not claim an order has been created merely because the customer requested one; creation happens only after confirmation and successful application execution.
- Language preference is conversational state: an explicitly requested language controls the reply. Cebuano means Cebuano; English-only means English. Do not switch to Waray, Tagalog, or another language.
`;

@Injectable()
export class MessengerSingleCallAiPolicyService extends MessengerSingleCallAiService {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super(config);
  }

  private withSemanticGuardrails(recentMessages: string[] = []): string[] {
    // The base service keeps only the last 16 conversation lines. Appending the
    // policy guarantees it survives that truncation and remains visible to Qwen.
    return [...recentMessages, SEMANTIC_GUARDRAILS];
  }

  async analyze(message: string, context: Parameters<MessengerSingleCallAiService["analyze"]>[1]): Promise<AIOrderActionResult> {
    return super.analyze(message, {
      ...context,
      recentMessages: this.withSemanticGuardrails(context.recentMessages ?? [])
    });
  }

  async classifyAndExtract(message: string, context?: Parameters<MessengerSingleCallAiService["classifyAndExtract"]>[1]): Promise<AIIntentResult> {
    const action = await super.analyze(message, {
      recentMessages: this.withSemanticGuardrails(context?.recentMessages ?? []),
      hasActiveOrder: Boolean(context?.activeOrderState),
      hasPendingNewOrder: Boolean(context?.activeOrderState?.flavors?.length)
    });

    const ai = await super.classifyAndExtract(message, context);
    if (action.orderAction === "confirm" && context?.activeOrderState?.flavors?.length) {
      // A semantic confirm means the customer is accepting the pending new-order
      // state. The pending application state, not the model's current-turn guess,
      // is authoritative for what should be created.
      const details = {
        ...context.activeOrderState,
        confirmed: true,
        missingFields: []
      } as AIIntentResult["details"];
      return {
        ...ai,
        intent: "order_confirmation",
        details
      };
    }
    return ai;
  }

  async generateActionResultReply(
    message: string,
    action: AIOrderAction,
    result: string,
    recentMessages: string[] = []
  ): Promise<string> {
    // Pending-new-order progress is already represented by the single-call AI
    // reply. Never expose the internal application result/validation text to the customer.
    if (action === "new_order" && /pending new-order draft was updated/i.test(result)) {
      const missing = result.match(/missing=([^\.]+)/i)?.[1]?.trim() ?? "";
      const state = result.match(/Current order state:\s*([^\.]+)\./i)?.[1]?.trim() ?? "";
      const items = state.match(/items=([^;]+)/i)?.[1]?.trim() ?? "your selected items";
      const foodTotal = state.match(/foodTotal=₱?([^;]+)/i)?.[1]?.trim();

      if (/deliveryMethod/i.test(missing)) return `Got it! I have ${items}. Would you like Pickup or Maxim delivery? 😊`;
      if (/paymentMethod/i.test(missing)) return `Got it! I have ${items}. Would you like to pay via GCash or COD? 😊`;
      if (/address|landmark|contactNumber/i.test(missing)) return "Got it! For Maxim delivery, please send your Address, Landmark, and Contact #. 😊";
      if (missing === "none" || /missing=none/i.test(result)) {
        return foodTotal ? `Great! I have ${items} for ₱${foodTotal}. Please confirm if all the details are correct. 😊` : `Great! I have ${items}. Please confirm if all the details are correct. 😊`;
      }
      return `Got it! I have ${items}. What would you like to provide next? 😊`;
    }

    if (/successfully created/i.test(result)) {
      const orderNumber = result.match(/Order number:\s*([^\.]+)\.?/i)?.[1]?.trim();
      if (orderNumber) {
        const order = await this.prisma.order.findUnique({
          where: { orderNumber },
          select: { id: true, orderNumber: true, quantity: true, totalAmount: true, preferredSchedule: true, items: true }
        });
        if (order) {
          const baseUrl = (this.config.get<string>("PUBLIC_APP_URL") ?? "https://www.empanadahauz.com").replace(/\/$/, "");
          const trackingUrl = `${baseUrl}/track/${order.id}`;
          const itemText = Array.isArray(order.items) && order.items.length
            ? order.items.map((item) => `${Number((item as Record<string, unknown>)?.quantity ?? 0)} pcs ${(item as Record<string, unknown>)?.name ?? "item"}`).join(", ")
            : `${order.quantity} pcs`;
          const formattedSchedule = order.preferredSchedule
            ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(order.preferredSchedule)
            : undefined;
          return [
            "Confirmed! Your order has been successfully placed. 😊",
            "",
            `Order #: ${order.orderNumber}`,
            `Order ID: ${order.id}`,
            `Items: ${itemText}`,
            `Food total: ₱${Number(order.totalAmount ?? 0).toFixed(2)}`,
            formattedSchedule ? `Schedule: ${formattedSchedule}` : undefined,
            "",
            `Track your order: ${trackingUrl}`
          ].filter(Boolean).join("\n");
        }
      }
    }

    return super.generateActionResultReply(message, action, result, recentMessages);
  }
}
