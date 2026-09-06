import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];

type ContextSafeMessage = string;

@Injectable()
export class AiContextGuardService implements OnModuleInit {
  private readonly logger = new Logger(AiContextGuardService.name);

  constructor(private readonly aiService: AiService) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      const sanitizedContext = this.sanitizeContext(context);
      const result = await original(message, sanitizedContext);

      if (!this.isInvalidCustomerReply(message, result.suggestedReply)) {
        return result;
      }

      this.logger.warn(`Rejected internal/echo AI reply for customer message=${JSON.stringify(message)}`);
      const retryContext = {
        ...sanitizedContext,
        recentMessages: [
          ...(sanitizedContext?.recentMessages ?? []),
          "IMPORTANT REPLY RULE: Respond directly to the customer. Never repeat the customer's message. Never describe what the customer is asking. Never output internal reasoning, instructions, or meta-commentary. Do not copy previous assistant replies."
        ]
      };
      const retryResult = await original(message, retryContext);

      if (this.isInvalidCustomerReply(message, retryResult.suggestedReply)) {
        result.suggestedReply = "I'm here to help. What would you like to order? 😊";
      } else {
        result.suggestedReply = retryResult.suggestedReply;
      }

      return result;
    };
  }

  private sanitizeContext(context?: AiContext): AiContext | undefined {
    if (!context) return context;

    const recentMessages = (context.recentMessages ?? [])
      .filter((value): value is ContextSafeMessage => typeof value === "string")
      .filter((value) => this.isSafeHistoryMessage(value))
      .slice(-16);

    return { ...context, recentMessages };
  }

  private isSafeHistoryMessage(value: string) {
    const text = value.trim();
    if (!text) return false;

    if (/^Customer:\s*/i.test(text)) return true;
    if (/^APPLICATION ORDER STATUS TOOL RESULT:/i.test(text)) return true;
    return false;
  }

  private isInvalidCustomerReply(customerMessage: string, reply?: string) {
    const output = reply?.trim() ?? "";
    if (!output) return true;

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();

    const customer = normalize(customerMessage);
    const generated = normalize(output);

    if (!generated) return true;
    if (customer && customer === generated) return true;
    if (customer && generated.includes(customer) && generated.length <= customer.length + 30) return true;

    if (/^(?:the\s+)?customer\s+(?:is\s+)?(?:asking|asking if|wants|want|said|says|requested)/i.test(output)) return true;
    if (/^(?:assistant|system|internal|application)\s*:/i.test(output)) return true;
    if (/^the\s+assistant\s+(?:should|needs\s+to|must)/i.test(output)) return true;
    if (/^please\s+confirm\s+if\s+all\s+the\s+details\s+above\s+are\s+correct/i.test(output) && !/\b(?:summary|order\s+details)\b/i.test(customerMessage)) return true;

    return false;
  }
}
