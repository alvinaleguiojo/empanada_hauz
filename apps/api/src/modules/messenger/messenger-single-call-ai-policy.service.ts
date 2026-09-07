import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
- Language preference is conversational state: an explicitly requested language controls the reply. Cebuano means Cebuano; English-only means English. Do not switch to Waray, Tagalog, or another language.
`;

@Injectable()
export class MessengerSingleCallAiPolicyService extends MessengerSingleCallAiService {
  constructor(config: ConfigService) {
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
    const shouldMergePendingState = action.orderAction === "confirm" || action.orderAction === "summary";
    return super.classifyAndExtract(message, shouldMergePendingState ? context : { ...context, activeOrderState: undefined });
  }
}
