import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AiOrderActionService } from "./ai-order-action.service";

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

  constructor(
    private readonly aiService: AiService,
    private readonly aiOrderActionService: AiOrderActionService
  ) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      const sanitizedContext = this.sanitizeContext(context);
      const action = this.extractApplicationAction(sanitizedContext?.recentMessages ?? []);

      if (action === "inquiry") {
        const applicationResults = this.extractApplicationResults(sanitizedContext?.recentMessages ?? []);
        const authoritativeDeliveryFee = this.extractAuthoritativeDeliveryFee(sanitizedContext?.recentMessages ?? []);

        // Delivery fees are already calculated by the application. Do not send
        // the authoritative amount back through a generative model that can
        // echo/paraphrase the question or omit the fee.
        if (authoritativeDeliveryFee !== undefined && this.isDeliveryFeeQuestion(message)) {
          return {
            intent: "inquiry",
            confidence: 1,
            details: { flavors: [], missingFields: [], confirmed: false },
            suggestedReply: `The delivery fee to your requested location is ₱${authoritativeDeliveryFee}.`,
            source: "ollama"
          };
        }

        const inquiryResult = `APPLICATION RESULT: This is a general Empanada Hauz business inquiry. Answer the customer's current question directly using the supplied business knowledge and any authoritative application results below. Do not ask for order details unless the customer actually asks to place an order.\n\n${INQUIRY_BUSINESS_KNOWLEDGE}\n\n${applicationResults}`;
        let suggestedReply = await this.generateInquiryReply(message, inquiryResult);

        if (!this.isInvalidCustomerReply(message, suggestedReply)) {
          return {
            intent: "inquiry",
            confidence: 1,
            details: { flavors: [], missingFields: [], confirmed: false },
            suggestedReply,
            source: "ollama"
          };
        }

        this.logger.warn(`Rejected invalid direct inquiry AI reply for customer message=${JSON.stringify(message)}`);
        suggestedReply = await this.generateInquiryReply(
          message,
          `${inquiryResult}\n\nAI RESPONSE RETRY: Answer the customer's current business question directly. If an authoritative application delivery-fee result is present, state that exact calculated fee. Do not echo the question, describe what the customer is asking, ask for order details, or redirect to an order flow unless the customer actually requested an order. Return only the customer-facing answer.`
        );

        if (this.isInvalidCustomerReply(message, suggestedReply)) {
          this.logger.error(`Direct inquiry AI reply remained invalid for customer message=${JSON.stringify(message)}`);
          throw new Error("AI failed to generate a valid customer-facing inquiry reply");
        }

        return {
          intent: "inquiry",
          confidence: 1,
          details: { flavors: [], missingFields: [], confirmed: false },
          suggestedReply,
          source: "ollama"
        };
      }

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
          "AI RESPONSE RETRY: Answer the CURRENT CUSTOMER MESSAGE directly. Do not echo the message, describe what the customer is asking, or tell the customer what the assistant should do. Use the Empanada Hauz business knowledge from the system prompt."
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

  private async generateInquiryReply(message: string, result: string) {
    return this.aiOrderActionService.generateActionResultReply(message, "inquiry", result, []);
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
        return this.isAllowedHistoryMessage(text);
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

  private isAllowedHistoryMessage(text: string) {
    return /^(?:Customer|Assistant):\s*/i.test(text)
      || /^APPLICATION BUSINESS KNOWLEDGE:/i.test(text)
      || /^APPLICATION ORDER STATUS TOOL RESULT:/i.test(text)
      || /^APPLICATION ORDER VALIDATION:/i.test(text)
      || /^LATEST DATABASE ORDER:/i.test(text)
      || /^APPLICATION AI ORDER ACTION:/i.test(text)
      || /^APPLICATION REUSED DELIVERY FACTS:/i.test(text)
      || /^APPLICATION DELIVERY FEE TOOL RESULT:/i.test(text)
      || /^APPLICATION DELIVERY LOCATION OPTIONS:/i.test(text)
      || /^APPLICATION VERIFIED DELIVERY LOCATION:/i.test(text)
      || /^APPLICATION DELIVERY LOCATION RESULT:/i.test(text)
      || /^AI RESPONSE RETRY:/i.test(text)
      || text === INQUIRY_BUSINESS_KNOWLEDGE.trim();
  }

  private isSafeHistoryMessage(value: string) {
    const text = value.trim();
    if (!text) return false;
    return this.isAllowedHistoryMessage(text);
  }

  private extractApplicationResults(recentMessages: string[]) {
    const results = recentMessages.filter((value) => {
      const text = value.trim();
      return /^APPLICATION DELIVERY FEE TOOL RESULT:/i.test(text)
        || /^APPLICATION DELIVERY LOCATION OPTIONS:/i.test(text)
        || /^APPLICATION VERIFIED DELIVERY LOCATION:/i.test(text)
        || /^APPLICATION DELIVERY LOCATION RESULT:/i.test(text);
    });
    return results.length ? `AUTHORITATIVE APPLICATION RESULTS:\n${results.join("\n")}` : "AUTHORITATIVE APPLICATION RESULTS: none.";
  }

  private extractAuthoritativeDeliveryFee(recentMessages: string[]) {
    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
      const match = recentMessages[index].match(/^APPLICATION DELIVERY FEE TOOL RESULT:[\s\S]*?current calculated delivery fee is ₱(\d+(?:\.\d+)?)/i);
      if (match?.[1]) return Number(match[1]);
    }
    return undefined;
  }

  private isDeliveryFeeQuestion(message: string) {
    return /\b(?:delivery\s*fee|delivery\s*charge|shipping\s*fee|df|how much (?:is )?(?:the )?delivery)\b/i.test(message);
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
