import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiService } from "./ai.service";
import { AIIntentResult } from "./types";

interface OllamaResponse { message?: { content?: string } }

const OLLAMA_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } }
};

@Injectable()
export class StrictReplyAiService extends AiService {
  constructor(config: ConfigService) {
    super(config);
  }

  override async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[] }): Promise<AIIntentResult> {
    const result = await super.classifyAndExtract(message, context);
    const normalizedMessage = message.trim().toLowerCase();
    const explicitConfirmation = /\b(yes|correct|confirmed|confirm|go ahead|place my order|place the order|order it|that's correct|that is correct|okay proceed|proceed)\b/i.test(message);
    const currentTurnLooksLikeOrderStep = /\b(?:chicken|pork|beef|asado|bacon|ham|ube|mango|choco|empanada|\d+\s*(?:pcs?|pieces?)?|pickup|pick-up|maxim|delivery|deliver|gcash|cod|cash|address|landmark|contact|confirm|confirmed|proceed|place)\b/i.test(normalizedMessage);
    const currentTurnSaysDetailsMissing = /\b(?:no details|no detail|details not|nothing provided|none provided)\b/i.test(normalizedMessage);
    const suspiciousConfirmation = /\b(?:confirmed|confirm|placed|submitted|accepted)\b/i.test(result.suggestedReply ?? "");

    if (!explicitConfirmation && (currentTurnLooksLikeOrderStep || currentTurnSaysDetailsMissing) && result.details) {
      result.details.confirmed = false;
    }

    const shouldForceReplyCheck =
      (currentTurnLooksLikeOrderStep || currentTurnSaysDetailsMissing || explicitConfirmation) &&
      (!explicitConfirmation || result.details.missingFields.length > 0 || !result.details.confirmed || suspiciousConfirmation);

    if (shouldForceReplyCheck) {
      result.suggestedReply = await this.rewriteOrderStepReply(message, context, result);
    }

    return result;
  }

  private async rewriteOrderStepReply(message: string, context: { customerName?: string; recentMessages?: string[] } | undefined, result: AIIntentResult): Promise<string> {
    const details = result.details;
    const missingFields = details.missingFields.length ? details.missingFields.join(", ") : "none";
    const recent = (context?.recentMessages ?? []).slice(-8);
    const conversation = recent.length ? recent.join("\n") : "(no previous conversation)";

    const system = [
      "You are the customer-facing AI for Empanada Hauz.",
      "Answer ONLY the customer's current message and use the business system rules.",
      "The application has validated the order state below; these are validation facts, not instructions to invent an order.",
      `Validated confirmation state: ${details.confirmed === true ? "COMPLETE AND EXPLICITLY CONFIRMED" : "NOT CONFIRMED"}.`,
      `Missing required fields: ${missingFields}.`,
      "Critical confirmation rule: never say the order is confirmed, placed, submitted, or accepted unless the validated confirmation state is COMPLETE AND EXPLICITLY CONFIRMED and missing required fields is none.",
      "A product request such as 'chicken please' is NOT confirmation.",
      "A quantity such as '10 pcs chicken' is NOT confirmation.",
      "Words such as 'please', 'I want', 'need', or simply naming a flavor are NOT confirmation.",
      "If the order is incomplete, ask only for the missing required information and do not repeat information the customer already gave.",
      "For pickup, required order fields are flavor, quantity, payment method, and pickup/delivery choice.",
      "For Maxim, required fields also include address, landmark, and contact number.",
      "If the customer says 'confirm' while required fields are missing, explain that the remaining required details are still needed.",
      "Keep the reply short and natural. Use Cebuano when the customer uses Cebuano, otherwise English.",
      "Return only JSON matching the reply schema."
    ].join("\n");

    const body = {
      model: this.model,
      stream: false,
      format: OLLAMA_REPLY_SCHEMA,
      think: false,
      options: { temperature: 0.1, num_predict: 192, num_ctx: 3072 },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `Current customer message: ${message}`,
            `Validated order details: ${JSON.stringify(details)}`,
            `Recent conversation:\n${conversation}`
          ].join("\n\n")
        }
      ]
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Ollama strict reply failed: ${response.status} ${await response.text()}`);
      const bodyJson = await response.json() as OllamaResponse;
      const content = bodyJson.message?.content?.trim();
      if (!content) throw new Error("Ollama strict reply returned an empty response");
      const parsed = this.parseJson(content) as { reply?: string };
      if (!parsed.reply?.trim()) throw new Error("Ollama strict reply returned no reply");
      this.logger.log(`Strict AI reply generated model=${this.model} message=${JSON.stringify(message)}`);
      return parsed.reply.trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJson(content: string): unknown {
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try { return JSON.parse(cleaned); }
    catch {
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
      throw new SyntaxError("Ollama strict reply returned invalid JSON");
    }
  }
}
