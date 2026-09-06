import { Injectable, OnModuleInit } from "@nestjs/common";
import { AiService } from "./ai.service";

type AiResult = Awaited<ReturnType<AiService["classifyAndExtract"]>>;
type AiContext = Parameters<AiService["classifyAndExtract"]>[1];

@Injectable()
export class AiOrderNormalizationService implements OnModuleInit {
  constructor(private readonly aiService: AiService) {}

  onModuleInit() {
    const originalClassify = this.aiService.classifyAndExtract.bind(this.aiService);
    this.aiService.classifyAndExtract = async (message, context) => {
      if (this.isOtherCustomerDataRequest(message)) {
        return {
          intent: "inquiry",
          confidence: 1,
          details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
          suggestedReply: "Sorry, I can only provide information about your own orders and Empanada Hauz. I can't share other customers' information.",
          source: "ollama"
        };
      }

      const result = await originalClassify(message, context);
      return this.normalize(result, message);
    };

    const originalOrderResult = this.aiService.generateOrderResultReply.bind(this.aiService);
    this.aiService.generateOrderResultReply = async (outcome, orderNumber) => {
      if (outcome === "created") {
        return orderNumber
          ? `Your order ${orderNumber} has been confirmed and placed successfully.`
          : "Your order has been confirmed and placed successfully.";
      }
      try {
        return await originalOrderResult(outcome, orderNumber);
      } catch {
        return "I couldn't place your order right now. Please try again.";
      }
    };
  }

  private isOtherCustomerDataRequest(message: string) {
    const lower = message.trim().toLowerCase();
    return /\b(?:other|another|different)\s+customer\b/i.test(lower)
      || /\b(?:someone\s+else(?:'s)?|another\s+person(?:'s)?)\b/i.test(lower)
      || /\b(?:customer(?:'s)?\s+(?:info|information|details|phone|number|address|order)|orders?\s+(?:of|from|for)\s+(?:other|another|someone))\b/i.test(lower)
      || /\b(?:list|show|give|tell)\b.*\bcustomer(?:s)?\b.*\b(?:info|information|details|orders?|phone|number|address)\b/i.test(lower)
      || /\bwhat\s+did\s+(?:the\s+)?(?:other|another)\s+customer\s+order\b/i.test(lower);
  }

  private normalize(result: AiResult, message: string): AiResult {
    this.recoverExplicitOrderFacts(result, message);
    this.normalizeFlavors(result);

    const preferredTime = result.details.preferredTime?.trim();
    if (!preferredTime || this.looksLikeDateOnly(preferredTime)) {
      result.details.preferredTime = undefined;
      result.suggestedReply = this.removeInvalidPreferredTime(result.suggestedReply);
    }
    return result;
  }

  private normalizeFlavors(result: AiResult) {
    const flavors = result.details.flavors ?? [];
    if (!flavors.length) return;

    const normalized = flavors.map((item) => {
      const rawName = String(item.name ?? "").trim();
      const name = /^ham$/i.test(rawName) ? "Ham & Cheese" : rawName;
      const unitPrice = name.toLowerCase() === "ham & cheese" ? 25 : Number(item.unitPrice ?? 0);
      const quantity = Number(item.quantity ?? 0);
      return { ...item, name, unitPrice, subtotal: quantity * unitPrice };
    });

    result.details.flavors = normalized;
    const quantity = normalized.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    result.details.quantity = quantity || result.details.quantity;
    result.details.totalAmount = normalized.reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0);
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
