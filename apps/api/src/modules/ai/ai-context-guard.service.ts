import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type ContextSafeMessage = string;

/**
 * Validates customer-facing AI output without trying to understand the customer's
 * message itself. Semantic intent/action decisions belong to AiOrderActionService.
 */
@Injectable()
export class AiContextGuardService implements OnModuleInit {
  private readonly logger = new Logger(AiContextGuardService.name);

  constructor(private readonly aiService: AiService) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      const sanitizedContext = this.sanitizeContext(context);
      const result = await original(message, sanitizedContext);
      result.suggestedReply = this.removeUnrequestedOrderNumber(message, result.suggestedReply);

      if (!this.isInvalidCustomerReply(message, result.suggestedReply)) {
        return result;
      }

      this.logger.warn(`Rejected invalid AI reply for customer message=${JSON.stringify(message)}`);

      const retryContext = {
        ...sanitizedContext,
        recentMessages: [
          ...(sanitizedContext?.recentMessages ?? []),
          "AI RESPONSE RETRY: Answer the CURRENT CUSTOMER MESSAGE directly. Do not echo the message, describe what the customer is asking, or tell the customer what the assistant should do. Use the Empanada Hauz business knowledge from the system prompt."
        ].slice(-17)
      } as AiContext;

      const retryResult = await original(message, retryContext);
      retryResult.suggestedReply = this.removeUnrequestedOrderNumber(message, retryResult.suggestedReply);

      if (this.isInvalidCustomerReply(message, retryResult.suggestedReply)) {
        this.logger.error(`AI reply remained invalid after retry for customer message=${JSON.stringify(message)}`);
        throw new Error("AI failed to generate a valid customer-facing reply");
      }

      result.suggestedReply = retryResult.suggestedReply;
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

    return /^(?:Customer|Assistant):\s*/i.test(text)
      || /^APPLICATION BUSINESS KNOWLEDGE:/i.test(text)
      || /^APPLICATION ORDER STATUS TOOL RESULT:/i.test(text)
      || /^APPLICATION ORDER VALIDATION:/i.test(text)
      || /^LATEST DATABASE ORDER:/i.test(text)
      || /^APPLICATION AI ORDER ACTION:/i.test(text)
      || /^APPLICATION REUSED DELIVERY FACTS:/i.test(text)
      || /^AI RESPONSE RETRY:/i.test(text);
  }

  private removeUnrequestedOrderNumber(message: string, reply?: string) {
    const output = reply?.trim() ?? "";
    if (!output || this.isOrderNumberRequested(message)) return output;
    return output
      .replace(/\bEMP-[A-Za-z0-9-]+\b/gi, "")
      .replace(/\bOrder\s+(?:ID|number|#)\s*[:#-]?\s*\.?/gi, "")
      .replace(/\s+([,.!?])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  private isOrderNumberRequested(message: string) {
    const lower = message.toLowerCase();
    return /\b(?:order\s*(?:id|number|no)|order\s*#)\b/i.test(lower)
      || /\b(?:status|summary|details)\b.*\border\b/i.test(lower);
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
