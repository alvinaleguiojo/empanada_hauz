import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIIntentResult, CustomerIntent, DeliveryMethodValue } from "./types";
import type { AIOrderAction } from "./ai-order-action.service";

const CUSTOMER_SYSTEM_PROMPT = `You are the customer support assistant for Empanada Hauz.

The CURRENT CUSTOMER MESSAGE is highest priority. Answer it directly.
Interpret the CURRENT CUSTOMER MESSAGE semantically. Do not assume the customer's wording must match predefined aliases.
Understand abbreviations, shorthand, misspellings, phonetic spellings, incomplete phrases, Cebuano/English mixed language, and casual Messenger-style wording.
Use the recent conversation context to resolve references such as "that", "same", "10 pcs", "gcash", "cod", "max", and other follow-up replies.
When answering a follow-up question, resolve omitted subjects, pronouns, and short replies against the most relevant recent customer message and active conversation context. Do not treat a contextual follow-up as a fresh standalone inquiry when its referent is clear.
Do not discard previously known information merely because it is not repeated in the latest message.
The application will merge your interpretation with the previous active order state.
A greeting starts a fresh conversation unless the customer explicitly refers to an existing order.
A flavor-only request needs a quantity; ask how many pcs only when the quantity is genuinely missing.
An order with missing required fields is NOT ready for confirmation.
Never ask for confirmation when required fields are missing.
For Maxim delivery, collect Address, Landmark, and Contact # before confirmation.
Pickup does not require delivery address details.
CASH means COD. Only explicit GCash means GCash.
A summary request means SHOW THE CURRENT ORDER SUMMARY; it is not itself a confirmation.
When the customer asks for order status, use the live order-status application/tool result when available. If no order can be found, ask for the order ID. Never invent an order status.
Never expose internal field names, JSON, intent names, tools, or MCP details.
Never say an order is confirmed/placed/created unless the application actually created it.
Use Cebuano when the customer uses Cebuano, otherwise English.
Keep replies short, clear, natural, and helpful.
Do not ask for information already provided.
Do not ask for a preferred delivery or pickup time.
Do not invent prices, delivery fees, times, policies, availability, or order details.
When the customer asks for business information, identify what information they are asking for from the conversation and answer using the relevant Business facts below. Do not merely acknowledge the request, and do not treat a business-information question as an order request unless the customer actually asks to place or change an order.

Existing-order changes:
- A customer asking to move, reschedule, postpone, advance, update, or otherwise change an already-created order is modifying that existing order, not placing a new order.
- A request to change only the delivery date or time is still an existing-order modification.
- References such as "my reservation", "my order", "it", "that booking", or "the one on [date]" should be resolved against the existing database order supplied by the application.
- Do not interpret a change request as a new order simply because the customer uses words such as "reservation", "reserve", "book", or "order".

Date interpretation:
- Use the CURRENT DATE/TIME IN ASIA/MANILA supplied in the prompt.
- Resolve relative dates semantically. When the customer says "today", "tomorrow", "yesterday", "this Monday", "next Friday", or similar, convert the requested deliveryDate to the concrete calendar date in YYYY-MM-DD format.
- Never return relative words such as "today" or "tomorrow" as the deliveryDate when the concrete date can be determined from the supplied current date/time.
- When changing only a date, preserve the existing time unless the customer also asks to change the time and the application passes that existing time in context.

Delivery availability:
- Empanada Hauz DOES offer delivery through Maxim.
- If the customer asks whether you deliver, offer delivery, have delivery, can deliver, or similar, answer YES and state that delivery is available via Maxim.
- A simple delivery-availability question is not a request for the customer's address yet.
- After answering delivery availability, you may naturally continue with: "What would you like to order?"
- Do not respond to a simple "Do you deliver?" by asking what the customer wants to order without first answering the delivery question.
- Do not ask for Address, Landmark, or Contact # unless the customer is actually proceeding with Maxim delivery/order setup.
- If the customer asks about delivery availability and also asks about their own delivery area, answer availability first and then explain that the delivery fee varies by location.

Confirmation interpretation rules:
- The customer may confirm using natural language, shorthand, abbreviations, typos, misspellings, phonetic spellings, or casual Messenger wording.
- Use the conversation context to determine whether the CURRENT CUSTOMER MESSAGE is accepting the immediately preceding complete order summary.
- Examples of semantic confirmation include "yes", "yep", "correct", "go ahead", "okay", "sure", "please do", "confirm", and obvious misspellings such as "confir" or other close variants. Do not require an exact keyword.
- Set confirmed=true only when the CURRENT CUSTOMER MESSAGE clearly means the customer accepts/confirms the current complete order.
- A message that merely provides new order information, asks a question, changes an item, requests a date/time change, or requests a summary is not confirmation.
- Do not mark a message as confirmed only because an earlier message was ready for confirmation. The CURRENT CUSTOMER MESSAGE itself must express acceptance.

Discount rules:
- Bulk order discount: Orders of 50 pcs or more qualify for a 10% discount on the food/order total.
- Only mention, offer, or apply this bulk order discount when the customer explicitly asks about a discount or asks a follow-up question about a discount that was already discussed.
- Do not proactively mention or offer this bulk order discount when the customer has not asked about discounts, even when the order quantity is 50 pcs or more.
- When the customer asks a follow-up such as "pila ang discount?", "how much is the discount?", or equivalent wording, use the recent conversation context to determine which quantity or discount discussion they are referring to, then apply the applicable business rule.
- Keep the 50+ pcs food/order discount separate from the 30+ pcs delivery-fee discount. Do not confuse the two rules.

Business facts:
- Minimum order: 10 pcs; mixed flavors allowed.
- Bacon with Cheese ₱35; Pork Regular ₱20; Pork Regular with Egg ₱25; Pork Asado ₱30.
- Ham & Cheese ₱25; Chicken ₱20; Chicken with Egg ₱25; Ube Empanada ₱25.
- Mango ₱25; Choco ₱30; Beef ₱35; Beef with Egg ₱40.
- Best sellers: Pork Regular with Egg, Chicken with Egg, Beef with Egg.
- Baked is ₱5 more. Preparation is about 1 hour.
- Payment: GCash or COD. GCash: Alvin Aleguiojo, 09453916796.
- Pickup/business location: Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao.
- IMPORTANT LOCATION RULE: When the customer asks where Empanada Hauz is located, where your location is, where the shop/pickup point is, or asks for the business address/location, answer with the Empanada Hauz pickup/business location above. Do NOT ask the customer to provide their own address. The customer's address is only needed when arranging Maxim delivery.
- Maxim delivery is available; Address, Landmark, and Contact # are required.
- Delivery fee varies by location; current delivery fee and priority number are on https://www.empanadahauz.com.
- 30+ pcs gets 20% off the delivery fee only when the customer asks about a discount.
- If today is Sunday in Asia/Manila, the business is closed.
- A complete pre-confirmation summary must end exactly with: Please confirm if all the details above are correct. 😊
`;

interface OllamaResponse { message?: { content?: string } }
type Details = AIIntentResult["details"];
type Flavor = Details["flavors"][number];

type CurrentInterpretation = {
  intent: CustomerIntent;
  startsNewConversation: boolean;
  flavorAction: "none" | "replace" | "add" | "remove";
  flavors: Array<{ name: string; quantity?: number }>;
  quantity?: number;
  location?: string;
  deliveryMethod?: DeliveryMethodValue;
  preferredTime?: string;
  deliveryDate?: string;
  address?: string;
  landmark?: string;
  contactNumber?: string;
  paymentMethod?: "cod" | "gcash";
  confirmed: boolean;
};

const PRICES: Record<string, number> = {
  "bacon with cheese": 35,
  "pork regular": 20,
  "pork regular with egg": 25,
  "pork asado": 30,
  "ham & cheese": 25,
  "ham and cheese": 25,
  "ham cheese": 25,
  "ham with cheese": 25,
  "ham": 25,
  "chicken": 20,
  "chicken with egg": 25,
  "ube": 25,
  "ube empanada": 25,
  "mango": 25,
  "choco": 30,
  "chocolate": 30,
  "beef": 35,
  "beef with egg": 40
};

const CANONICAL_FLAVORS = [
  "Bacon with Cheese",
  "Pork Regular",
  "Pork Regular with Egg",
  "Pork Asado",
  "Ham & Cheese",
  "Chicken",
  "Chicken with Egg",
  "Ube Empanada",
  "Mango",
  "Choco",
  "Beef",
  "Beef with Egg"
];

@Injectable()
export class AiService {
  protected readonly logger = new Logger(AiService.name);
  protected readonly baseUrl: string;
  protected readonly model: string;
  protected readonly interpretationModel: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct");
    this.interpretationModel = this.config.get<string>("OLLAMA_INTERPRET_MODEL", "qwen2.5:0.5b");
  }

  async classifyAndExtract(message: string, context?: { customerName?: string; recentMessages?: string[]; activeOrderState?: Details }): Promise<AIIntentResult> {
    if (this.isOutOfScopeRequest(message)) {
      this.logger.log(`AI request rejected as out-of-scope: ${JSON.stringify(message)}`);
      return {
        intent: "inquiry",
        confidence: 1,
        details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
        suggestedReply: "I’m here to help with Empanada Hauz orders, prices, pickup, delivery, payments, and order status. 😊",
        source: "ollama"
      };
    }

    const now = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "long" }).format(new Date());
    const recentMessages = (context?.recentMessages ?? []).slice(-16);
    const applicationAction = this.extractApplicationAction(recentMessages);
    const current = await this.extractCurrentOrderFields(message, now, recentMessages, context?.activeOrderState);
    current.intent = this.intentFromApplicationAction(applicationAction);
    current.confirmed = applicationAction === "confirm";
    current.startsNewConversation = applicationAction === "inquiry" && !context?.activeOrderState;

    const details = this.mergeOrderState(context?.activeOrderState, current);
    const systemPrompt = `${CUSTOMER_SYSTEM_PROMPT}\nCurrent date/time in Asia/Manila: ${now}\nCustomer name: ${context?.customerName?.trim() || "Customer"}`;
    const replyContext = this.buildReplyContext(message, recentMessages, details, applicationAction);
    const suggestedReply = await this.generateCustomerReply(systemPrompt, message, replyContext);
    const intent = current.intent;
    const confidence = current.flavors.length || details.flavors.length || current.confirmed || applicationAction !== "inquiry" || Boolean(details.deliveryMethod) || Boolean(details.paymentMethod) ? 1 : 0;
    return {
      intent,
      confidence,
      details,
      suggestedReply,
      source: "ollama"
    };
  }

  private extractApplicationAction(recentMessages: string[]): AIOrderAction {
    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
      const match = recentMessages[index].match(/^APPLICATION AI ORDER ACTION:\s*(new_order|modify_existing|cancel_existing|status|summary|inquiry|confirm)\b/i);
      if (match) return match[1].toLowerCase() as AIOrderAction;
    }
    return "inquiry";
  }

  private intentFromApplicationAction(action: AIOrderAction): CustomerIntent {
    switch (action) {
      case "confirm": return "order_confirmation";
      case "new_order": return "reservation";
      case "modify_existing": return "reservation";
      case "cancel_existing": return "reservation";
      case "status": return "inquiry";
      case "summary": return "inquiry";
      case "inquiry": return "inquiry";
    }
  }

  async generateOrderResultReply(outcome: "created" | "failed", orderNumber?: string): Promise<string> {
    const status = outcome === "created"
      ? `APPLICATION RESULT: The application successfully created the customer's confirmed order.${orderNumber ? ` Order number: ${orderNumber}.` : ""}`
      : "APPLICATION RESULT: The application could not create the customer's confirmed order.";
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 96, num_ctx: 1536 },
      messages: [
        { role: "system", content: `${CUSTOMER_SYSTEM_PROMPT}\nGenerate only the final short customer-facing reply. Never mention internal tools or MCP.` },
        { role: "user", content: status }
      ]
    }, "Ollama order result reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty order result reply");
    return this.cleanReply(reply);
  }

  private async extractCurrentOrderFields(message: string, now: string, recentMessages: string[], activeOrderState?: Details): Promise<CurrentInterpretation> {
    const conversationContext = recentMessages.length
      ? `RECENT CONVERSATION (oldest to newest):\n${recentMessages.join("\n")}`
      : "RECENT CONVERSATION: none.";
    const activeStateContext = activeOrderState
      ? `CURRENT APPLICATION ORDER STATE:\n${this.formatOrderContext(activeOrderState)}`
      : "CURRENT APPLICATION ORDER STATE: none.";
    const response = await this.ollamaChat({
      model: this.interpretationModel,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 384, num_ctx: 2048 },
      messages: [
        {
          role: "system",
          content: `${CUSTOMER_SYSTEM_PROMPT}\n\nYou are an order-field extractor. The application has already determined the customer's top-level action separately. Do NOT decide or return the customer's intent, action, or confirmation state. Extract only order fields explicitly stated or strongly implied by the CURRENT CUSTOMER MESSAGE in context. Return ONLY compact valid JSON. Do not use markdown or explanations.\n\nSchema:\n{\n  "flavorAction": "none|replace|add|remove",\n  "flavors": [{"name":"Canonical flavor name","quantity":number}],\n  "quantity": number,\n  "location": "string",\n  "deliveryMethod": "pickup|maxim",\n  "preferredTime": "string",\n  "deliveryDate": "YYYY-MM-DD",\n  "address": "string",\n  "landmark": "string",\n  "contactNumber": "string",\n  "paymentMethod": "cod|gcash"\n}\nFor dates, resolve explicit or strongly implied relative dates from CURRENT DATE/TIME IN ASIA/MANILA. Do not classify the message as a new order, modification, cancellation, status request, summary, inquiry, or confirmation. Do not decide whether an order should be created or changed. Only extract customer-provided order fields.`
        },
        {
          role: "user",
          content: `${conversationContext}\n\n${activeStateContext}\n\nCURRENT CUSTOMER MESSAGE:\n${message}\n\nCURRENT DATE/TIME IN ASIA/MANILA:\n${now}`
        }
      ]
    }, "Ollama order-field extraction failed");

    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty order-field extraction");
    return this.parseCurrentInterpretation(raw);
  }

  private parseCurrentInterpretation(raw: string): CurrentInterpretation {
    const candidates = [this.cleanReply(raw)];
    const extracted = this.extractJsonObject(raw);
    if (extracted && extracted !== candidates[0]) candidates.push(extracted);

    for (const candidate of candidates) {
      try {
        return this.normalizeCurrentInterpretation(JSON.parse(candidate) as Partial<CurrentInterpretation>);
      } catch {
        const repaired = this.repairTruncatedJson(candidate);
        if (!repaired || repaired === candidate) continue;
        try {
          return this.normalizeCurrentInterpretation(JSON.parse(repaired) as Partial<CurrentInterpretation>);
        } catch {
          // Continue to next candidate.
        }
      }
    }

    this.logger.error("Qwen returned invalid structured order-field extraction", "Unable to parse or repair JSON");
    throw new Error("Qwen returned invalid order-field extraction JSON");
  }

  private normalizeCurrentInterpretation(parsed: Partial<CurrentInterpretation>): CurrentInterpretation {
    return {
      intent: "inquiry",
      startsNewConversation: false,
      flavorAction: parsed.flavorAction === "replace" || parsed.flavorAction === "add" || parsed.flavorAction === "remove" ? parsed.flavorAction : "none",
      flavors: Array.isArray(parsed.flavors)
        ? parsed.flavors
            .map((item) => ({ name: this.normalizeFlavorName(item?.name), quantity: this.optionalPositiveNumber(item?.quantity) }))
            .filter((item) => item.name)
        : [],
      quantity: this.optionalPositiveNumber(parsed.quantity),
      location: this.optionalText(parsed.location),
      deliveryMethod: parsed.deliveryMethod === "pickup" || parsed.deliveryMethod === "maxim" ? parsed.deliveryMethod : undefined,
      preferredTime: this.optionalText(parsed.preferredTime),
      deliveryDate: this.optionalText(parsed.deliveryDate),
      address: this.optionalText(parsed.address),
      landmark: this.optionalText(parsed.landmark),
      contactNumber: this.normalizePhone(parsed.contactNumber),
      paymentMethod: parsed.paymentMethod === "cod" || parsed.paymentMethod === "gcash" ? parsed.paymentMethod : undefined,
      confirmed: false
    };
  }

  private extractJsonObject(raw: string) {
    const text = this.cleanReply(raw);
    const start = text.indexOf("{");
    if (start < 0) return undefined;
    const end = text.lastIndexOf("}");
    return text.slice(start, end >= start ? end + 1 : text.length).trim();
  }

  private repairTruncatedJson(value: string) {
    const text = value.trim();
    if (!text.startsWith("{")) return undefined;

    let best: string | undefined;
    for (let end = text.length; end >= Math.max(2, text.length - 500); end -= 1) {
      const prefix = text.slice(0, end).trimEnd();
      const repaired = this.closeJson(prefix);
      if (!repaired) continue;
      try {
        JSON.parse(repaired);
        best = repaired;
        break;
      } catch {
        // Keep trimming until the last complete property can be parsed.
      }
    }
    return best;
  }

  private closeJson(value: string) {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (const char of value) {
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{" || char === "[") {
        stack.push(char);
      } else if (char === "}" || char === "]") {
        const expected = char === "}" ? "{" : "[";
        if (stack.at(-1) !== expected) return undefined;
        stack.pop();
      }
    }

    let result = value.trimEnd();
    if (inString) result += '"';

    while (stack.length) {
      const opener = stack.pop();
      result += opener === "{" ? "}" : "]";
    }
    return result;
  }

  private mergeOrderState(previous: Details | undefined, current: CurrentInterpretation): Details {
    const freshBase: Details = { flavors: [], missingFields: [], confirmed: false };
    if (current.startsNewConversation) return this.finalizeOrderState(this.applyInterpretation(freshBase, current));

    const base = previous ?? freshBase;
    const merged = this.applyInterpretation({ ...base, flavors: [...(base.flavors ?? [])] }, current);
    return this.finalizeOrderState(merged);
  }

  private applyInterpretation(base: Details, current: CurrentInterpretation): Details {
    const merged: Details = { ...base, confirmed: false, missingFields: [] };

    if (current.flavorAction === "replace" && current.flavors.length) {
      merged.flavors = current.flavors.map((item) => this.toFlavor({ name: item.name, quantity: item.quantity ?? 0 }));
    } else if (current.flavorAction === "add" && current.flavors.length) {
      merged.flavors = this.mergeFlavorAdds(base.flavors ?? [], current.flavors);
    } else if (current.flavorAction === "remove" && current.flavors.length) {
      merged.flavors = this.removeFlavors(base.flavors ?? [], current.flavors);
    } else if (current.flavors.length) {
      merged.flavors = current.flavors.map((item) => this.toFlavor({ name: item.name, quantity: item.quantity ?? 0 }));
    }

    for (const field of ["quantity", "location", "deliveryMethod", "preferredTime", "deliveryDate", "address", "landmark", "contactNumber", "paymentMethod"] as const) {
      const value = current[field];
      if (value !== undefined && value !== "") (merged as Record<string, unknown>)[field] = value;
    }

    if (current.quantity !== undefined && merged.flavors.length === 1 && current.flavorAction !== "add" && current.flavorAction !== "remove") {
      const only = merged.flavors[0];
      merged.flavors = [{ ...only, quantity: current.quantity, subtotal: current.quantity * Number(only.unitPrice ?? 0) }];
      merged.quantity = current.quantity;
    } else if (merged.flavors.length && current.flavorAction !== "add" && current.flavorAction !== "remove") {
      const hasPositiveFlavorQuantity = merged.flavors.some((item) => Number(item.quantity ?? 0) > 0);
      if (hasPositiveFlavorQuantity || current.flavors.some((item) => item.quantity !== undefined)) {
        merged.quantity = merged.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      }
    }

    if (current.confirmed) merged.confirmed = true;
    return merged;
  }

  private mergeFlavorAdds(existing: Flavor[], additions: Array<{ name: string; quantity?: number }>): Flavor[] {
    const map = new Map(existing.map((item) => [item.name.toLowerCase(), { ...item }]));
    for (const addition of additions) {
      const key = addition.name.toLowerCase();
      const current = map.get(key);
      const quantity = Number(current?.quantity ?? 0) + Number(addition.quantity ?? 0);
      const unitPrice = current?.unitPrice ?? PRICES[key] ?? 0;
      map.set(key, { name: addition.name, quantity, unitPrice, subtotal: quantity * unitPrice });
    }
    return [...map.values()];
  }

  private removeFlavors(existing: Flavor[], removals: Array<{ name: string; quantity?: number }>): Flavor[] {
    const map = new Map(existing.map((item) => [item.name.toLowerCase(), { ...item }]));
    for (const removal of removals) {
      const key = removal.name.toLowerCase();
      const current = map.get(key);
      if (!current) continue;
      const quantity = Number(current.quantity) - Number(removal.quantity ?? 0);
      if (quantity <= 0) map.delete(key);
      else map.set(key, { ...current, quantity, subtotal: quantity * Number(current.unitPrice ?? 0) });
    }
    return [...map.values()];
  }

  private finalizeOrderState(details: Details): Details {
    const flavors = (details.flavors ?? []).map((item) => {
      const name = this.normalizeFlavorName(item.name);
      const unitPrice = Number(item.unitPrice ?? PRICES[name.toLowerCase()] ?? 0);
      const quantity = Math.max(0, Number(item.quantity ?? 0));
      return { name, quantity, unitPrice, subtotal: quantity * unitPrice };
    }).filter((item) => item.name);
    const quantity = flavors.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = flavors.reduce((sum, item) => sum + Number(item.subtotal ?? item.quantity * Number(item.unitPrice ?? 0)), 0);
    const finalized: Details = { ...details, flavors, quantity: quantity || details.quantity, totalAmount, missingFields: [] };
    finalized.missingFields = this.calculateMissingFields(finalized);
    return finalized;
  }

  private buildReplyContext(message: string, recentMessages: string[], details: Details, action: AIOrderAction): string {
    const businessFacts = "BUSINESS FACTS: Empanada Hauz business information is defined by the Business facts in the system prompt. Use those facts to answer business-information questions directly. Empanada Hauz pickup/business location is Cabancalan 2, Bulacao, Cebu City, near Cabancalan 2 Chapel, beside Prince Bulacao. Empanada Hauz DOES deliver via Maxim. Delivery fee varies by location. Do not ask for delivery address for a simple business-location or delivery-availability inquiry.";

    if (action === "status") {
      return `APPLICATION ACTION: status\n${recentMessages.filter((value) => /^(?:APPLICATION ORDER STATUS TOOL RESULT:|LATEST DATABASE ORDER:)/i.test(value.trim())).join("\n") || "No live order-status application result was provided."}\n${businessFacts}\nCONVERSATION CONTEXT:\n${recentMessages.slice(-16).join("\n")}\n\nRespond only to the customer's current status question. Use only factual application state when available; never invent status.`;
    }

    if (action === "summary") {
      return details.flavors.length
        ? `APPLICATION ACTION: summary\nAPPLICATION ORDER FACTS:\n${this.formatOrderContext(details)}\n${businessFacts}\nCONVERSATION CONTEXT:\n${recentMessages.slice(-16).join("\n")}\nProvide the current order summary. Do not treat the summary request as confirmation.`
        : `APPLICATION ACTION: summary\n${businessFacts}\nCONVERSATION CONTEXT:\n${recentMessages.slice(-16).join("\n")}\nTell the customer that there is no active order summary available yet.`;
    }

    if (details.flavors.length) {
      return `APPLICATION ACTION: ${action}\nAPPLICATION ORDER FACTS:\n${this.formatOrderContext(details)}\n\n${businessFacts}\n\nCONVERSATION CONTEXT:\n${recentMessages.slice(-16).join("\n")}\n\nNEXT ACTION DIRECTIVE:\n${this.buildNextActionDirective(action, details)}\n\nThe application state above is the current merged order state. The current message itself always wins.`;
    }

    return `APPLICATION ACTION: ${action}\n${businessFacts}\n\n${recentMessages.length ? `CONVERSATION CONTEXT:\n${recentMessages.slice(-16).join("\n")}` : "CONVERSATION CONTEXT: none."}`;
  }

  private buildNextActionDirective(action: AIOrderAction, details: Details): string {
    if (action === "modify_existing") {
      return "Explain the requested existing-order change using the supplied application state. Do not create a new order. Do not claim that the database was changed unless an application result explicitly confirms it.";
    }
    if (action === "cancel_existing") {
      return "Explain the cancellation result from the application. Do not claim cancellation succeeded unless the application result explicitly confirms it.";
    }
    if (action === "confirm") {
      return "Treat the customer message as confirmation only if the application has already determined it is a valid confirmation. Use the current order state and application result; never claim placement unless the application created the order.";
    }
    if (action === "new_order") {
      if (details.deliveryMethod === "maxim") {
        const deliveryMissing = details.missingFields.filter((field) => ["address", "landmark", "contactNumber"].includes(field));
        if (deliveryMissing.length) return `Ask explicitly for these missing Maxim delivery details: ${this.humanMissing(deliveryMissing).join(", ")}. Do not ask for confirmation.`;
      }
      if (details.missingFields.length) return `Ask only for the missing required information: ${this.humanMissing(details.missingFields).join(", ")}. Do not present confirmation.`;
      return "All required order fields are present. Present the complete order summary and end exactly with: Please confirm if all the details above are correct. 😊";
    }
    return "Answer the customer's current message directly using the supplied application state and Business facts. Do not merely acknowledge a business-information request; provide the relevant information when it is available. Do not invent facts or ask for order information unless the customer actually requested an order action.";
  }

  private formatOrderContext(details: Details): string {
    return [
      `Flavors: ${details.flavors.map((x) => `${x.quantity > 0 ? `${x.quantity} pcs` : "quantity pending"} ${x.name} (₱${x.unitPrice ?? 0} each)`).join(", ")}`,
      `Quantity: ${details.quantity ?? details.flavors.reduce((sum, x) => sum + x.quantity, 0)}`,
      `Total food amount: ₱${details.totalAmount ?? 0}`,
      `Delivery method: ${details.deliveryMethod ?? "missing"}`,
      `Payment method: ${details.paymentMethod ?? "missing"}`,
      `Address: ${details.address ?? "missing"}`,
      `Landmark: ${details.landmark ?? "missing"}`,
      `Contact #: ${details.contactNumber ?? "missing"}`,
      details.deliveryDate ? `Delivery date: ${details.deliveryDate}` : "",
      details.preferredTime ? `Preferred time: ${details.preferredTime}` : "",
      `Missing required information: ${details.missingFields.length ? this.humanMissing(details.missingFields).join(", ") : "none"}`,
      `Placement status: ${details.missingFields.length === 0 && details.flavors.some((x) => x.quantity > 0) ? "READY only after explicit confirmation" : "NOT READY"}`
    ].filter(Boolean).join("\n");
  }

  private calculateMissingFields(details: Details): string[] {
    const missing: string[] = [];
    const quantity = Number(details.quantity ?? 0);
    const flavorQuantity = details.flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (!details.flavors.length) missing.push("flavors");
    if (!quantity || flavorQuantity !== quantity) missing.push("quantity");
    if (quantity > 0 && quantity < 10) missing.push("minimumOrder");
    if (!details.deliveryMethod) missing.push("deliveryMethod");
    if (!details.paymentMethod) missing.push("paymentMethod");
    if (details.deliveryMethod === "maxim") {
      if (!details.address?.trim()) missing.push("address");
      if (!details.landmark?.trim()) missing.push("landmark");
      if (!details.contactNumber?.trim()) missing.push("contactNumber");
    }
    return [...new Set(missing)];
  }

  private humanMissing(fields: string[]) {
    return fields.map((field) => field === "deliveryMethod"
      ? "delivery method (Pickup or Maxim)"
      : field === "paymentMethod"
        ? "payment method (GCash or COD)"
        : field === "address"
          ? "Address"
          : field === "landmark"
            ? "Landmark"
            : field === "contactNumber"
              ? "Contact #"
              : field === "quantity"
                ? "quantity"
                : field === "flavors"
                  ? "flavor"
                  : field === "minimumOrder"
                    ? "at least 10 pcs"
                    : field);
  }

  private isBusinessRelatedMessage(message: string) {
    return /\b(?:empanada|order|orders|pork|chicken|beef|ube|mango|choco|bacon|ham|cheese|pcs?|pieces?|gcash|cod|cash|pickup|pick\s*up|maxim|delivery|deliver|address|landmark|contact|payment|price|pricing|cost|how much|hm|df|status|summary|book|reserve|buy|availab|available|discount|promo|reschedule|rescheduled|move|moved|moving|postpone|postponed|advance|change|changed|today|tomorrow|yesterday)\b/i.test(message);
  }

  private isOutOfScopeRequest(message: string) {
    const lower = message.trim().toLowerCase();
    if (!lower) return false;
    if (this.isBusinessRelatedMessage(message)) return false;
    if (/^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|thanks|thank you|okay|ok|yes|no|sure|alright|bye|goodbye)[!.\s]*$/i.test(lower)) return false;
    return /\b(?:javascript|typescript|python|java|c\+\+|c#|ruby|php|golang|rust|html|css|sql|react|angular|vue|node(?:\.js)?|coding|code|programming|program|script|software|api|database|algorithm|homework|essay|assignment|write\s+(?:a|an)\s+(?:code|program|script)|debug|debugging|developer|programmer)\b/i.test(lower);
  }

  private normalizeFlavorName(value?: string) {
    const raw = this.optionalText(value);
    if (!raw) return "";
    const exact = CANONICAL_FLAVORS.find((name) => name.toLowerCase() === raw.toLowerCase());
    if (exact) return exact;
    const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();
    const aliases: Record<string, string> = {
      "pork with egg": "Pork Regular with Egg",
      "pork regular egg": "Pork Regular with Egg",
      "chicken egg": "Chicken with Egg",
      "beef egg": "Beef with Egg",
      "ham": "Ham & Cheese",
      "ham and cheese": "Ham & Cheese",
      "ham cheese": "Ham & Cheese",
      "ham with cheese": "Ham & Cheese",
      "ube": "Ube Empanada",
      "chocolate": "Choco"
    };
    return aliases[normalized] ?? raw.trim();
  }

  private optionalText(value?: unknown) {
    if (typeof value !== "string") return undefined;
    const text = value.trim();
    return text || undefined;
  }

  private optionalPositiveNumber(value?: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  }

  private normalizePhone(value?: unknown) {
    if (typeof value !== "string") return undefined;
    const raw = value.trim();
    const digits = raw.replace(/\s+/g, "");
    if (/^09\d{9}$/.test(digits)) return digits;
    if (/^\+?63\d{10}$/.test(digits)) return digits;
    return raw || undefined;
  }

  private toFlavor(item: { name: string; quantity: number }): Flavor {
    const name = this.normalizeFlavorName(item.name);
    const quantity = Number(item.quantity);
    const unitPrice = Number(PRICES[name.toLowerCase()] ?? 0);
    return { name, quantity, unitPrice, subtotal: quantity * unitPrice };
  }

  private async generateCustomerReply(systemPrompt: string, message: string, context: string): Promise<string> {
    const response = await this.ollamaChat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 160, num_ctx: 3072 },
      messages: [
        { role: "system", content: `${systemPrompt}\nGenerate only the final short customer-facing reply.` },
        { role: "user", content: `${context}\n\nCURRENT CUSTOMER MESSAGE: ${message}` }
      ]
    }, "Ollama customer reply failed");
    const reply = response.message?.content?.trim();
    if (!reply) throw new Error("Ollama returned an empty customer reply");
    return this.cleanReply(reply);
  }

  private cleanReply(value: string) {
    return value.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  private async ollamaChat(body: Record<string, unknown>, errorMessage: string): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`${errorMessage}: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}
