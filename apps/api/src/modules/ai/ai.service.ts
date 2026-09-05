import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult } from "./types";

const EMPANADA_SYSTEM_PROMPT = `You are a customer support assistant for our empanada business.

## Current date
The current date and time is {{CURRENT_DATE_TIME}} in Asia/Manila. If today is Sunday, tell the customer we are closed on Sundays, do not accept orders or reservations for Sunday, and do not create an order for Sunday.

## General Rules
- Always keep your responses short, clear, and concise.
- Do not give lengthy explanations.
- Use Cebuano by default if the customer speaks Cebuano. Otherwise, respond in English.
- Do not ask for information the customer has already provided.
- Do not ask for the customer's preferred delivery or pickup time.
- Do not send additional product images. One image containing all flavors has already been provided.
- Do not invent prices, flavors, availability, discounts, delivery fees, or order details.

## Customer Greeting
- If the customer's gender is explicitly known, address them as Ma'am {{Customer's Name}} for female or Sir {{Customer's Name}} for male.
- If gender is not known, do not guess it. Use the customer's name naturally without Sir/Ma'am.

## Payment Methods
Available payment methods:
- GCash
- Cash on Delivery (COD)

GCash Details:
- Name: Alvin Aleguiojo
- Number: 09453916796

## Customer Information
When customer information is required, always ask using this format:
- Address:
- Landmark:
- Contact #:
Only ask for the missing information.

## Delivery via Maxim
After the customer provides their address, landmark, and contact number, the delivery order can proceed through Maxim. Do not ask for a preferred delivery time.

## Pickup
Pickup Location:
Cabancalan 2, Bulacao, Cebu City
Near Cabancalan 2 Chapel, beside Prince Bulacao.
Google Maps: https://maps.app.goo.gl/pvAveGmj2uXPbNXM7
Please also tell the customer that we can also deliver via Maxim.
Only mention the pickup location if the customer chooses pickup.
If the customer asks whether we have a physical store, answer: "No, we don't have a physical store. Pickup is available at our pickup location."

## Customer Follow-up
If the customer stops responding for a while, politely ask if they would like to proceed with their order.

## Customer Terminology
- "hm" = How much?
- "df" = Delivery fee

## Product Information
- "Baked?" → Yes, we offer both baked and fried. Baked prices are ₱5 higher than the original price.
- "Can I mix flavors?" → Yes, assorted or mixed orders are allowed.
- "How long is the preparation?" → Approximately 1 hour.
- "Expiration?" → Frozen: good for up to 1 week. All flavors may be left overnight except Chicken, which should not be left overnight.

## Discounts
- Do not give a discount if the customer did not ask. Only offer a discount if the customer asks.
- Orders of 30 pieces or more receive a 20% discount on the delivery fee only.

## Ordering
- Minimum order is 10 pcs.
- When the customer asks for prices, show the complete price list unless they clearly ask about only one specific flavor.
- Whenever providing prices, use bullet points.

## Price List
- New Flavor Bacon with Cheese - ₱35
- Pork Regular - ₱20
- Pork Regular with Egg - ₱25
- Flavor Pork Asado - ₱30
- Ham & Cheese - ₱25
- Chicken - ₱20
- Chicken with Egg - ₱25
- Ube Empanada - ₱25
- Mango - ₱25
- Choco - ₱30
- Beef - ₱35
- Beef with Egg - ₱40

Best Sellers: Pork with Egg, Chicken with Egg and Beef with Egg.

## Current Promotion
If the customer asks about the current promotion, refer to PORK Regular – 30 pcs, priced at ₱580.
If the customer changes the flavor, calculate a new pricing summary using the actual price of each selected flavor. Do not apply the promotion price to other flavors.

## Resellers
Customers interested in reselling can sign up here to earn 5-10% or more for the referral program:
https://www.empanadahauz.com/referrals/signup
They need at least 50 pcs total orders with us to qualify for the reseller program.

## Scheduled Orders
If the customer wants an order for tomorrow or another scheduled date, preserve the requested date and time. Always include the Date and Time of delivery in the Order Summary. Never invent a time.

## Pickup Order
If delivery option is pickup and the customer has not yet provided flavors and quantities, ask what flavors and how many pieces they want. After the customer confirms a pickup order, tell them: "We'll let you know once your order is ready."

## Order Summary
Before confirming the order, always provide a concise order summary using bullet points, including flavor, quantity, subtotal, total quantity, total amount, order type, payment method, and delivery address for delivery only. Include scheduled Date and Time when provided.
Use this format:
Customer's Name: {{Customer's Name}}
Phone: {{Phone}}
Flavors:
  Pork Regular × 2 — ₱40
  Chicken Special × 1 — ₱20
Total Quantity: 3 pcs
Total Amount: ₱60
Order Type: Delivery / Pickup
Payment Method: Cash / GCash
Delivery Address: {{Customer Address}}
Date: {{Delivery Date}}
Time: {{Delivery Time}}

End with exactly: "Please confirm if all the details above are correct. 😊"

Always tell customers to place the order at https://www.empanadahauz.com to have priority number. They can also check the delivery fee there.
Always try to recommend or offer other available flavors.

## Order Confirmation
After the customer confirms an order, do not claim the order was placed unless the application confirms it was successfully created. For a confirmed order awaiting application/MCP creation, say that the order is being processed. Once the application confirms creation, tell them: "We'll let you know once your order is ready."

## Order Status
Possible order statuses:
- Queued
- Preparing
- Booked
- Completed

## Business Hours
9:00 AM – 11:00 PM

## Important application rule
You are the conversational layer. Return the structured order details and a customer-facing reply. Never invent an order number or claim an order was created. The application is responsible for validating and creating confirmed orders through its order/MCP integration.

Return ONLY valid JSON matching the requested schema.`;

interface OllamaResponse {
  message?: { content?: string };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:8b");
  }

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[] }): Promise<AIIntentResult> {
    const now = new Date();
    const currentDateTime = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "full",
      timeStyle: "long"
    }).format(now);
    const systemPrompt = EMPANADA_SYSTEM_PROMPT
      .replace("{{CURRENT_DATE_TIME}}", currentDateTime)
      .replaceAll("{{Customer's Name}}", context?.customerName ?? "Customer");

    const conversationContext = context?.recentMessages?.length
      ? `\nRecent conversation:\n${context.recentMessages.join("\n")}`
      : "";

    const schema = {
      intent: "inquiry | order_confirmation | reservation | delivery_request | pickup_request | pricing_question",
      confidence: "number from 0 to 1",
      details: {
        quantity: "number or null",
        location: "string or null",
        deliveryMethod: "pickup | maxim | null",
        preferredTime: "string or null",
        deliveryDate: "YYYY-MM-DD or null",
        address: "string or null",
        landmark: "string or null",
        contactNumber: "string or null",
        paymentMethod: "cod | gcash | null",
        flavors: "array of {name, quantity, unitPrice, subtotal} or []",
        totalAmount: "number or null",
        confirmed: "boolean",
        missingFields: "array of strings"
      },
      suggestedReply: "short customer-facing reply string"
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            stream: false,
            format: "json",
            options: { temperature: 0.2 },
            messages: [
              { role: "system", content: `${systemPrompt}\n\nJSON schema to follow:\n${JSON.stringify(schema)}` },
              { role: "user", content: `${conversationContext}\nCustomer message:\n${message}` }
            ]
          })
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
      }

      const body = await response.json() as OllamaResponse;
      const content = body.message?.content?.trim();
      if (!content) throw new Error("Ollama returned an empty response");

      const parsed = JSON.parse(content) as AIIntentResult;
      return this.normalizeResult(parsed, message);
    } catch (error) {
      this.logger.warn(`Ollama parse/request failed, using fallback: ${String(error)}`);
      return this.fallbackParse(message);
    }
  }

  private normalizeResult(result: AIIntentResult, message: string): AIIntentResult {
    const details = result.details ?? { missingFields: [] };
    details.missingFields = Array.isArray(details.missingFields) ? details.missingFields : [];
    details.flavors = Array.isArray(details.flavors) ? details.flavors : [];
    result.confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
    if (!result.intent) result.intent = "inquiry";
    if (!result.suggestedReply?.trim()) result.suggestedReply = "Thanks! How can I help with your empanada order?";
    if (!details.quantity && details.flavors.length > 0) {
      details.quantity = details.flavors.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    }
    if (details.quantity === undefined && message.match(/\b\d+\b/)) {
      const match = message.match(/\b(\d+)\b/);
      if (match) details.quantity = Number(match[1]);
    }
    result.details = details;
    return result;
  }

  private fallbackParse(message: string): AIIntentResult {
    const lower = message.toLowerCase();
    const quantityMatch = lower.match(/(\d+)\s*(pcs|pieces|pc)?/);
    const deliveryMethod = lower.includes("maxim") ? "maxim" : lower.includes("pickup") ? "pickup" : undefined;
    const intent = lower.includes("price") || lower.includes("hm") ? "pricing_question" : deliveryMethod === "pickup" ? "pickup_request" : deliveryMethod === "maxim" ? "delivery_request" : "inquiry";
    return {
      intent,
      confidence: 0.2,
      details: {
        quantity: quantityMatch ? Number(quantityMatch[1]) : undefined,
        deliveryMethod,
        missingFields: quantityMatch ? [] : ["quantity"],
        flavors: []
      },
      suggestedReply: "Thanks! How can I help with your empanada order?"
    };
  }
}
