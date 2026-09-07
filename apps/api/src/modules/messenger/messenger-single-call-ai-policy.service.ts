import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AIIntentResult } from "../ai/types";
import type { AIOrderAction, AIOrderActionResult } from "../ai/ai-order-action.service";
import { MessengerSingleCallAiService } from "./messenger-single-call-ai.service";

const SEMANTIC_GUARDRAILS = `APPLICATION SEMANTIC GUARDRAILS:
- The CURRENT CUSTOMER MESSAGE is authoritative for the current turn.
- A customer who is asking to order, buy, get, reserve, or start a new order is expressing a new-order request unless the current message explicitly refers to an already-created order and asks to change, reschedule, cancel, or check that existing order.
- An active database order does not by itself turn a new-order request into an existing-order modification.
- When the current message contains new item/flavor/quantity information, extract those current details even when another active order exists.
- Never infer an existing-order reference date merely from an earlier order schedule. referencedOrderDate is allowed only when the CURRENT CUSTOMER MESSAGE semantically refers to an existing order or its schedule.
- A customer asking for clarification about something the assistant previously said is an inquiry/clarification, not automatically an order-status request.
- For a fresh new-order request, do not revive or copy a stale pending draft when the current message supplies different item details. The current order details take precedence.
- Language preference is conversational state: explicitly requested language should control the reply. Cebuano means Cebuano; English-only means English. Do not switch to Waray, Tagalog, or another language.
`;

@Injectable()
export class MessengerSingleCallAiPolicyService extends MessengerSingleCallAiService {
  constructor(config: ConfigService) {
    super(config);
  }

  async analyze(message: string, context: Parameters<MessengerSingleCallAiService["analyze"]>[1]): Promise<AIOrderActionResult> {
    return super.analyze(message, {
      ...context,
      recentMessages: [SEMANTIC_GUARDRAILS, ...(context.recentMessages ?? [])]
    });
  }

  async classifyAndExtract(message: string, context?: Parameters<MessengerSingleCallAiService["classifyAndExtract"]>[1]): Promise<AIIntentResult> {
    const action = await super.analyze(message, {
      recentMessages: [SEMANTIC_GUARDRAILS, ...(context?.recentMessages ?? [])],
      hasActiveOrder: Boolean(context?.activeOrderState),
      hasPendingNewOrder: Boolean(context?.activeOrderState?.flavors?.length)
    });
    const shouldMergePendingState = action.orderAction === "confirm" || action.orderAction === "summary";
    return super.classifyAndExtract(message, shouldMergePendingState ? context : { ...context, activeOrderState: undefined });
  }
}
