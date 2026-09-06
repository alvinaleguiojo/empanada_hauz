import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AiService } from "../ai/ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type AiResult = Awaited<ReturnType<AiService["classifyAndExtract"]>>;

export const NEW_ORDER_ROUTING_MARKER = "__new_order_routing__";
export const NEW_ORDER_RESET_MARKER = "__new_order_reset__";

@Injectable()
export class MessengerOrderRoutingGuardService implements OnModuleInit {
  private readonly logger = new Logger(MessengerOrderRoutingGuardService.name);

  constructor(private readonly aiService: AiService) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      const routingChoice = this.getExistingOrderRoutingChoice(message, context);
      if (routingChoice === "new") {
        this.logger.log("Customer selected NEW order; resetting previous order context");
        return {
          intent: "inquiry",
          confidence: 1,
          details: {
            flavors: [],
            missingFields: [NEW_ORDER_RESET_MARKER],
            confirmed: false
          },
          suggestedReply: "Okay, let's start a new order. What would you like to order? 😊",
          source: "ollama"
        } satisfies AiResult;
      }

      if (routingChoice === "change") {
        this.logger.log("Customer selected CHANGE existing order; continuing with existing-order context");
        return original(message, context);
      }

      if (!this.isNewOrderRequest(message) || !this.hasActiveExistingOrder(context)) {
        return original(message, context);
      }

      return {
        intent: "inquiry",
        confidence: 1,
        details: {
          flavors: [],
          missingFields: [NEW_ORDER_ROUTING_MARKER],
          confirmed: false
        },
        suggestedReply: "You already have an active order. Would you like to change your existing order or place a new order? 😊",
        source: "ollama"
      } satisfies AiResult;
    };
  }

  private getExistingOrderRoutingChoice(message: string, context?: AiContext) {
    const lower = message.trim().toLowerCase();
    if (!/^(new|new\s+order(?:\s+(?:please|pls))?|change|edit|update|modify|existing|old|same|yes|no)$/i.test(lower)) return undefined;

    const recent = (context?.recentMessages ?? []).slice(-6).map((entry) => String(entry).trim()).join("\n");
    const askedRouting = /(?:existing order|place a new order|change your existing order)/i.test(recent);
    if (!askedRouting) return undefined;

    if (/^(new|new\s+order(?:\s+(?:please|pls))?|yes)$/i.test(lower)) return "new" as const;
    if (/^(change|edit|update|modify|existing|old|same|no)$/i.test(lower)) return "change" as const;
    return undefined;
  }

  private hasActiveExistingOrder(context?: AiContext) {
    return (context?.recentMessages ?? []).some((entry) =>
      /^LATEST DATABASE ORDER:\s+orderNumber=/i.test(String(entry).trim())
      && !/\bstatus=(?:completed|cancelled)\b/i.test(String(entry))
    );
  }

  private isNewOrderRequest(message: string) {
    const lower = message.trim().toLowerCase();
    if (!lower) return false;

    if (/\b(?:reschedule|re-schedule|change|update|modify|edit|replace|switch|correct|correction|remove|take\s+out|cancel)\b/i.test(lower)
      && /\border\b/i.test(lower)) {
      return false;
    }

    if (/^(?:new\s+order|new\s+order\s+(?:please|pls))$/i.test(lower)) return true;
    if (/\b(?:place|make|start)\s+(?:a\s+)?new\s+order\b/i.test(lower)) return true;
    if (/\b(?:i|we)\s+(?:would\s+like|want|would\s+love)\s+to\s+(?:place\s+)?(?:a\s+)?new\s+order\b/i.test(lower)) return true;
    if (/\b(?:i|we)\s+(?:would\s+like|want|would\s+love)\s+to\s+order\b/i.test(lower)) return true;
    if (/\b(?:can|may)\s+(?:i|we)\s+(?:place\s+)?(?:a\s+)?new\s+order\b/i.test(lower)) return true;
    if (/\b(?:can|may)\s+(?:i|we)\s+order\b/i.test(lower)) return true;
    if (/\b(?:order|buy)\s+\d+\s*(?:pcs?|pieces?)\b/i.test(lower)) return true;

    return false;
  }
}
