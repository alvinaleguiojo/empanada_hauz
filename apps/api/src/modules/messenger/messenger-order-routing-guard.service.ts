import { Injectable, OnModuleInit } from "@nestjs/common";
import { AiService } from "../ai/ai.service";

 type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type AiResult = Awaited<ReturnType<AiService["classifyAndExtract"]>>;

@Injectable()
export class MessengerOrderRoutingGuardService implements OnModuleInit {
  constructor(private readonly aiService: AiService) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      if (!this.isNewOrderRequest(message) || !this.hasActiveExistingOrder(context)) {
        return original(message, context);
      }

      return {
        intent: "inquiry",
        confidence: 1,
        details: context?.activeOrderState ?? {
          flavors: [],
          missingFields: [],
          confirmed: false
        },
        suggestedReply: "You already have an active order. Would you like to change your existing order or place a new order? 😊",
        source: "ollama"
      } satisfies AiResult;
    };
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

    // Existing-order actions must never be treated as a new order.
    if (/\b(?:reschedule|re-schedule|change|update|modify|edit|replace|switch|correct|correction|remove|take\s+out|cancel)\b/i.test(lower)
      && /\border\b/i.test(lower)) {
      return false;
    }

    if (/\b(?:place|make|start)\s+(?:a\s+)?new\s+order\b/i.test(lower)) return true;
    if (/\b(?:i|we)\s+(?:would\s+like|want|would\s+love)\s+to\s+(?:place\s+)?(?:a\s+)?new\s+order\b/i.test(lower)) return true;
    if (/\b(?:i|we)\s+(?:would\s+like|want|would\s+love)\s+to\s+order\b/i.test(lower)) return true;
    if (/\b(?:can|may)\s+(?:i|we)\s+(?:place\s+)?(?:a\s+)?new\s+order\b/i.test(lower)) return true;
    if (/\b(?:can|may)\s+(?:i|we)\s+order\b/i.test(lower)) return true;
    if (/\b(?:order|buy)\s+\d+\s*(?:pcs?|pieces?)\b/i.test(lower)) return true;

    return false;
  }
}
