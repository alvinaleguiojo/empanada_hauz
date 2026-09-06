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
      return this.normalize(result, message);
    };
  }

  private normalize(result: AiResult, message: string): AiResult {
    this.recoverExplicitOrderFacts(result, message);

    const preferredTime = result.details.preferredTime?.trim();
    if (!preferredTime || this.looksLikeDateOnly(preferredTime)) {
      result.details.preferredTime = undefined;
      result.suggestedReply = this.removeInvalidPreferredTime(result.suggestedReply);
    }
    return result;
  }

  private recoverExplicitOrderFacts(result: AiResult, message: string) {
    const text = message.trim();
    const lower = text.toLowerCase();
    const details = result.details;

    if (!details.deliveryMethod) {
      if (/\bmax(?:im)?(?:\s+delivery)?\b/i.test(text) || /maxim delivery/i.test(text)) {
        details.deliveryMethod = "maxim";
        details.missingFields = details.missingFields.filter((field) => field !== "deliveryMethod");
      } else if (/\b(?:pickup|pick\s+up)\b/i.test(text)) {
        details.deliveryMethod = "pickup";
        details.missingFields = details.missingFields.filter((field) => field !== "deliveryMethod");
      }
    }

    if (!details.paymentMethod) {
      if (/\bgcash\b/i.test(lower)) {
        details.paymentMethod = "gcash";
        details.missingFields = details.missingFields.filter((field) => field !== "paymentMethod");
      } else if (/\b(?:cash|cod|cash\s+on\s+delivery)\b/i.test(lower)) {
        details.paymentMethod = "cod";
        details.missingFields = details.missingFields.filter((field) => field !== "paymentMethod");
      }
    }

    const address = this.extractLabeledValue(text, "address");
    if (!details.address && address) {
      details.address = address;
      details.missingFields = details.missingFields.filter((field) => field !== "address");
    }

    const landmark = this.extractLabeledValue(text, "landmark");
    if (!details.landmark && landmark) {
      details.landmark = landmark;
      details.missingFields = details.missingFields.filter((field) => field !== "landmark");
    }

    const contactNumber = this.extractLabeledValue(text, "contact(?:\s*#|\s*number)?");
    if (!details.contactNumber && contactNumber) {
      const normalized = contactNumber.replace(/\s+/g, "");
      if (/^(?:09\d{9}|\+?63\d{10})$/.test(normalized)) {
        details.contactNumber = normalized;
        details.missingFields = details.missingFields.filter((field) => field !== "contactNumber");
      }
    }

    const deliveryDate = this.extractLabeledValue(text, "delivery\s+date");
    if (!details.deliveryDate && deliveryDate) details.deliveryDate = deliveryDate;
  }

  private extractLabeledValue(text: string, label: string) {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*[-•]?\\s*${label}\\s*[:#-]\\s*(.+?)\\s*$`, "im"));
    return match?.[1]?.trim();
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
