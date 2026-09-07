import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type ContextSafeMessage = string;
type AiAction = "new_order" | "modify_existing" | "cancel_existing" | "status" | "summary" | "inquiry" | "confirm";

const INQUIRY_BUSINESS_KNOWLEDGE = `
EMPANADA HAUZ BUSINESS KNOWLEDGE FOR CUSTOMER INQUIRIES:
Menu and prices per piece:
Bacon with Cheese - ₱35
Pork Regular - ₱20
Pork Regular with Egg - ₱25
Pork Asado - ₱30
Ham & Cheese - ₱25
Chicken - ₱20
Chicken with Egg - ₱25
Ube Empanada - ₱25
Mango - ₱25
Choco - ₱30
Beef - ₱35
Beef with Egg - ₱40
Best sellers: Pork Regular with Egg, Chicken with Egg, Beef with Egg.
Baked is ₱5 more.
Minimum order is 10 pcs; mixed flavors are allowed.
Preparation is about 1 hour.
Payment: GCash or COD. GCash: Alvin Aleguiojo, 09453916796.
Pickup/business location: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao.
Maxim delivery is available. Delivery fee varies by location.
`;

/**
 * Validates customer-facing AI output without deciding the customer's intent.
 * Semantic intent/action decisions belong to AiOrderActionService.
 */
@Injectable()
export class AiContextGuardService implements OnModuleInit {
  private readonly logger = new Logger(AiContextGuardService.name);

  constructor(private readonly aiService: AiService) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      const sanitizedContext = this.sanitizeContext(context);
      const action = this.extractApplicationAction(sanitizedContext?.recentMessages ?? []);
      const effectiveContext = this.contextForAction(sanitizedContext, action);
      const result = await original(message, effectiveContext);
      result.suggestedReply = this.removeUnrequestedOrderNumber(message, result.suggestedReply);

      if (!this.isInvalidCustomerReply(message, result.suggestedReply)) {
        return result;
      }

      this.logger.warn(`Rejected invalid AI reply for customer message=${JSON.stringify(message)}`);

      const retryContext = {
        ...effectiveContext,
        recentMessages: [
          ...(effectiveContext?.recentMessages ?? []),
          action === "inquiry" ? INQUIRY_BUSINESS_KNOWLEDGE : "",
          action === "inquiry"
            ? "AI RESPONSE RETRY: Answer the customer's current business question directly from the supplied business knowledge. Do not echo the question, describe what the customer is asking, ask for order details, or redirect to an order flow unless the customer actually requested an order. Return only the customer-facing answer."
            : "AI RESPONSE RETRY: Answer the CURRENT CUSTOMER MESSAGE directly. Do not echo the message, describe what the customer is asking, or tell the customer what the assistant should do. Use the Empanada Hauz business knowledge from the system prompt."
        ].filter(Boolean).slice(-18)
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

  private extractApplicationAction(recentMessages: string[]): AiAction {
    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
      const match = recentMessages[index].match(/^APPLICATION AI ORDER ACTION:\s*(new_order|modify_existing|cancel_existing|status|summary|inquiry|confirm)\b/i);
      if (match) return match[1].toLowerCase() as AiAction;
    }
    return "inquiry";
  }

  private contextForAction(context: AiContext | undefined, action: AiAction): AiContext | undefined {
    if (!context || action !== "inquiry") return context;

    return {
      ...context,
      activeOrderState: undefined,
      recentMessages: [
        ...(context.recentMessages ?? []),
        INQUIRY_BUSINESS_KNOWLEDGE
      ].filter((value) => {
        const text = value.trim();
        return /^(?:Customer|Assistant):\s*/i.test(text)
          || /^APPLICATION BUSINESS KNOWLEDGE:/i.test(text)
          || /^APPLICATION AI ORDER ACTION:/i.test(text)
          || /^AI RESPONSE RETRY:/i.test(text)
          || text === INQUIRY_BUSINESS_KNOWLEDGE.trim();
      })
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
      || /^AI RESPONSE RETRY:/i.test(text)
      || text === INQUIRY_BUSINESS_KNOWLEDGE.trim();
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
