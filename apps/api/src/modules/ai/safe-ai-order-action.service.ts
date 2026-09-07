import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiOrderActionService, AIOrderActionResult } from "./ai-order-action.service";

@Injectable()
export class SafeAiOrderActionService extends AiOrderActionService {
  constructor(config: ConfigService) {
    super(config);
  }

  override async analyze(
    message: string,
    context: Parameters<AiOrderActionService["analyze"]>[1]
  ): Promise<AIOrderActionResult> {
    if (/^(?:hi|hello|hey)(?:\s+empanada\s+hauz)?[!.\s]*$/i.test(message.trim())) {
      return {
        orderAction: "inquiry",
        confidence: 1,
        newOrderFlowActive: false,
        reuseExistingDelivery: false
      };
    }
    return super.analyze(message, context);
  }

  override async generateActionResultReply(
    message: string,
    action: Parameters<AiOrderActionService["generateActionResultReply"]>[1],
    result: string,
    recentMessages: string[] = []
  ): Promise<string> {
    const reply = await super.generateActionResultReply(message, action, result, recentMessages);
    return this.sanitize(reply);
  }

  private sanitize(value: string): string {
    const text = value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      for (const key of ["suggestedReply", "reply", "response", "message", "content"]) {
        if (typeof parsed[key] === "string" && parsed[key].trim()) return parsed[key].trim();
      }
      return "Thanks for messaging Empanada Hauz! How can we help you today? 😊";
    } catch {
      return text;
    }
  }
}
