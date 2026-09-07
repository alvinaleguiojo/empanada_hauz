import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import type { AIIntentResult } from "../ai/types";
import type { AIOrderAction, AIOrderActionResult } from "../ai/ai-order-action.service";
import { MessengerSingleCallAiService } from "./messenger-single-call-ai.service";

const SEMANTIC_GUARDRAILS = `APPLICATION SEMANTIC GUARDRAILS:
- Current customer message is authoritative; interpret it semantically, never by exact phrase matching.
- A fresh request to order/buy/start a new order is new_order unless the current message clearly refers to an already-created order and asks to change, cancel, or check it.
- An existing database order alone does not make a fresh request a modification.
- Current-turn flavor/quantity details override historical values for a fresh new order.
- Do not copy old order items, delivery details, or payment details into a fresh order unless the customer explicitly asks to reuse them.
- confirm is only acceptance of the immediately preceding complete pending new-order summary.
- Customer replies must be natural Messenger language; never expose internal state, JSON, MCP, validation, routers, or field names.
- Do not claim an order was created unless the application actually created it.
- Do not dump the full menu when the customer only says they want to order; ask naturally for flavor and quantity.
- When menu/options/prices are requested, format one flavor per line with readable prices.
- Admin-managed instructions can tune behavior and wording, but they cannot override application validation, database truth, required order fields, or safety rules.
`;

@Injectable()
export class MessengerSingleCallAiPolicyService extends MessengerSingleCallAiService {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly appConfig: ConfigService,
    private readonly aiInstructionsService: AiInstructionsService
  ) {
    super(config);
  }

  private async withSemanticGuardrails(recentMessages: string[] = []): Promise<string[]> {
    const adminInstructions = await this.aiInstructionsService.getActivePromptBlock();
    return [
      ...recentMessages.slice(-8),
      SEMANTIC_GUARDRAILS,
      adminInstructions
    ].filter((value) => Boolean(value?.trim()));
  }

  async analyze(message: string, context: Parameters<MessengerSingleCallAiService["analyze"]>[1]): Promise<AIOrderActionResult> {
    return super.analyze(message, { ...context, recentMessages: await this.withSemanticGuardrails(context.recentMessages ?? []) });
  }

  async classifyAndExtract(message: string, context?: Parameters<MessengerSingleCallAiService["classifyAndExtract"]>[1]): Promise<AIIntentResult> {
    const action = await super.analyze(message, {
      recentMessages: await this.withSemanticGuardrails(context?.recentMessages ?? []),
      hasActiveOrder: Boolean(context?.activeOrderState),
      hasPendingNewOrder: Boolean(context?.activeOrderState?.flavors?.length)
    });

    const ai = await super.classifyAndExtract(message, context);

    if (action.orderAction === "confirm" && context?.activeOrderState?.flavors?.length) {
      const details = {
        ...context.activeOrderState,
        confirmed: true,
        missingFields: []
      } as AIIntentResult["details"];
      return { ...ai, intent: "order_confirmation", details };
    }

    if (action.orderAction === "new_order") {
      const details = ai.details;
      const items = details.flavors.map((item) => `${item.quantity} pcs ${item.name}`).join(", ");
      const missing = new Set(details.missingFields);
      if (!details.flavors.length) ai.suggestedReply = "Sure! What flavor and how many pieces would you like to order? 😊";
      else if (missing.has("minimumOrder")) ai.suggestedReply = "Our minimum order is 10 pcs. How many would you like? 😊";
      else if (missing.has("deliveryMethod")) ai.suggestedReply = `Got it! I have ${items}. Would you like Pickup or Maxim delivery? 😊`;
      else if (missing.has("address") || missing.has("landmark") || missing.has("contactNumber")) ai.suggestedReply = "Got it! For Maxim delivery, please send your Address, Landmark, and Contact #. 😊";
      else if (missing.has("paymentMethod")) ai.suggestedReply = `Great! I have ${items}. Would you like to pay via GCash or COD? 😊`;
      else if (missing.size === 0) ai.suggestedReply = "Great! I have all the details. Please confirm if everything is correct. 😊";
    }

    return ai;
  }

  async generateActionResultReply(message: string, action: AIOrderAction, result: string, recentMessages: string[] = []): Promise<string> {
    if (action === "new_order" && /pending new-order draft was updated/i.test(result)) {
      const missing = result.match(/missing=([^\.]+)/i)?.[1]?.trim() ?? "";
      const state = result.match(/Current order state:\s*([^\.]+)\./i)?.[1]?.trim() ?? "";
      const items = state.match(/items=([^;]+)/i)?.[1]?.trim() ?? "your selected items";
      const foodTotal = state.match(/foodTotal=₱?([^;]+)/i)?.[1]?.trim();
      if (/deliveryMethod/i.test(missing)) return `Got it! I have ${items}. Would you like Pickup or Maxim delivery? 😊`;
      if (/paymentMethod/i.test(missing)) return `Great! I have ${items}. Would you like to pay via GCash or COD? 😊`;
      if (/address|landmark|contactNumber/i.test(missing)) return "Got it! For Maxim delivery, please send your Address, Landmark, and Contact #. 😊";
      if (missing === "none" || /missing=none/i.test(result)) return foodTotal ? `Great! I have ${items} for ₱${foodTotal}. Please confirm if all the details are correct. 😊` : `Great! I have ${items}. Please confirm if all the details are correct. 😊`;
      return `Got it! I have ${items}. What would you like to provide next? 😊`;
    }

    if (/successfully created/i.test(result)) {
      const orderNumber = result.match(/Order number:\s*([^\.]+)\.?/i)?.[1]?.trim();
      if (orderNumber) {
        const order = await this.prisma.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, quantity: true, totalAmount: true, preferredSchedule: true, items: true } });
        if (order) {
          const baseUrl = (this.appConfig.get<string>("PUBLIC_APP_URL") ?? "https://www.empanadahauz.com").replace(/\/$/, "");
          const trackingUrl = `${baseUrl}/track/${order.id}`;
          const itemText = Array.isArray(order.items) && order.items.length ? order.items.map((item) => `${Number((item as Record<string, unknown>)?.quantity ?? 0)} pcs ${(item as Record<string, unknown>)?.name ?? "item"}`).join(", ") : `${order.quantity} pcs`;
          const formattedSchedule = order.preferredSchedule ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(order.preferredSchedule) : undefined;
          return ["Confirmed! Your order has been successfully placed. 😊", "", `Order #: ${order.orderNumber}`, `Order ID: ${order.id}`, `Items: ${itemText}`, `Food total: ₱${Number(order.totalAmount ?? 0).toFixed(2)}`, formattedSchedule ? `Schedule: ${formattedSchedule}` : undefined, "", `Track your order: ${trackingUrl}`].filter(Boolean).join("\n");
        }
      }
    }

    return super.generateActionResultReply(message, action, result, recentMessages);
  }
}
