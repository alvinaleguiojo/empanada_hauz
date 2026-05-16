import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { AIIntentResult, DeliveryMethodValue } from "./types";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client?: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    this.model = this.config.get<string>("OPENAI_MODEL", "gpt-5-mini");
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async classifyAndExtract(message: string): Promise<AIIntentResult> {
    if (!this.client) {
      return this.fallbackParse(message);
    }

    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content:
              "You are an order automation engine for an empanada business. Return strict JSON with keys: intent, confidence, details, suggestedReply. details keys: quantity, location, deliveryMethod, preferredTime, missingFields."
          },
          {
            role: "user",
            content: message
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "messenger_order_parse",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                intent: {
                  type: "string",
                  enum: [
                    "inquiry",
                    "order_confirmation",
                    "reservation",
                    "delivery_request",
                    "pickup_request",
                    "pricing_question"
                  ]
                },
                confidence: { type: "number" },
                details: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    quantity: { type: ["number", "null"] },
                    location: { type: ["string", "null"] },
                    deliveryMethod: {
                      type: ["string", "null"],
                      enum: ["pickup", "maxim", null]
                    },
                    preferredTime: { type: ["string", "null"] },
                    missingFields: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["quantity", "location", "deliveryMethod", "preferredTime", "missingFields"]
                },
                suggestedReply: { type: "string" }
              },
              required: ["intent", "confidence", "details", "suggestedReply"]
            }
          }
        }
      });

      return JSON.parse(response.output_text) as AIIntentResult;
    } catch (error) {
      this.logger.warn(`OpenAI parse failed, using fallback: ${String(error)}`);
      return this.fallbackParse(message);
    }
  }

  private fallbackParse(message: string): AIIntentResult {
    const lower = message.toLowerCase();
    const quantityMatch = lower.match(/(\d+)\s*(pcs|pieces|pc)?/);
    const timeMatch = lower.match(/(\d{1,2}\s?(am|pm))/);
    const deliveryMethod: DeliveryMethodValue | undefined = lower.includes("maxim")
      ? "maxim"
      : lower.includes("pickup")
        ? "pickup"
        : undefined;

    const details = {
      quantity: quantityMatch ? Number(quantityMatch[1]) : undefined,
      location: this.extractLocation(lower),
      deliveryMethod,
      preferredTime: timeMatch?.[1],
      missingFields: [] as string[]
    };

    if (!details.quantity) {
      details.missingFields.push("quantity");
    }
    if (!details.deliveryMethod) {
      details.missingFields.push("deliveryMethod");
    }
    if (!details.preferredTime) {
      details.missingFields.push("preferredTime");
    }

    const intent = lower.includes("price")
      ? "pricing_question"
      : deliveryMethod === "pickup"
        ? "pickup_request"
        : deliveryMethod === "maxim"
          ? "delivery_request"
          : "inquiry";

    return {
      intent,
      confidence: 0.62,
      details,
      suggestedReply:
        details.missingFields.length > 0
          ? `Thanks. Please confirm your ${details.missingFields.join(", ")} so I can finalize the order.`
          : details.quantity && details.quantity < 20
            ? "We can do that. For better value, many customers order 20 pcs or more. Would you like to increase your order?"
            : "Thanks. I have the details and can prepare this for confirmation."
    };
  }

  private extractLocation(input: string) {
    const known = ["talisay", "bacolod", "mansilingan", "granada", "silay"];
    return known.find((value) => input.includes(value));
  }
}
