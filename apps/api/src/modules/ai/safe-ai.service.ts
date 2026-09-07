import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { ProductRecord, ProductsService } from "../products/products.service";
import { AIIntentResult } from "./types";
import { AiService } from "./ai.service";

@Injectable()
export class SafeAiService extends AiService {
  constructor(
    config: ConfigService,
    aiInstructionsService: AiInstructionsService,
    productsService: ProductsService
  ) {
    super(config, aiInstructionsService, productsService);
  }

  override async classifyAndExtract(
    message: string,
    context?: Parameters<AiService["classifyAndExtract"]>[1]
  ): Promise<AIIntentResult> {
    const text = message.trim();

    if (/^(?:hi|hello|hey)(?:\s+empanada\s+hauz)?[!.\s]*$/i.test(text)) {
      return {
        intent: "inquiry",
        confidence: 1,
        details: context?.activeOrderState ?? {
          flavors: [],
          missingFields: [],
          confirmed: false
        },
        suggestedReply: "Hello! 👋 Welcome to Empanada Hauz. How can we help you today? 😊",
        source: "ollama"
      };
    }

    const result = await super.classifyAndExtract(message, context);
    return {
      ...result,
      suggestedReply: this.sanitizeCustomerReply(result.suggestedReply)
    };
  }

  private sanitizeCustomerReply(value?: string): string {
    const text = value?.trim() ?? "";
    if (!text) return "";

    const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const unfenced = withoutThink
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(unfenced) as Record<string, unknown>;
      for (const key of ["suggestedReply", "reply", "response", "message", "content"]) {
        if (typeof parsed[key] === "string" && parsed[key].trim()) {
          return parsed[key].trim();
        }
      }
      return "Thanks for messaging Empanada Hauz! How can we help you today? 😊";
    } catch {
      return unfenced;
    }
  }
}
