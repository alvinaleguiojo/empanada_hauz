import { Injectable, OnModuleInit } from "@nestjs/common";
import { AiService } from "./ai.service";

type AiResult = Awaited<ReturnType<AiService["classifyAndExtract"]>>;
type AiContext = Parameters<AiService["classifyAndExtract"]>[1];

@Injectable()
export class AiOrderNormalizationService implements OnModuleInit {
  constructor(private readonly aiService: AiService) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);
    this.aiService.classifyAndExtract = async (message, context) => {
      const result = await original(message, context);
      return this.normalize(result);
    };
  }

  private normalize(result: AiResult): AiResult {
    const preferredTime = result.details.preferredTime?.trim();
    if (!preferredTime || this.looksLikeDateOnly(preferredTime)) {
      result.details.preferredTime = undefined;
      result.suggestedReply = this.removeInvalidPreferredTime(result.suggestedReply);
    }
    return result;
  }

  private looksLikeDateOnly(value: string) {
    return /^(?:\d{4}-\d{2}-\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/i.test(value);
  }

  private removeInvalidPreferredTime(reply: string) {
    return reply
      .replace(/\s*[-•]?\s*Preferred time:\s*(?:\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\.?/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
