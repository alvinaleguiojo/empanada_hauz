import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiToolDefinition } from "./ai-tool.types";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { ProductsService, ProductRecord } from "../products/products.service";

interface OllamaToolCall {
  type?: string;
  function?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}
interface OllamaResponse {
  message?: {
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
}
interface RuntimeRequest { customerId: string; conversationId: string; channel: string; customerName?: string; message: string; recentMessages?: string[] }
interface ToolCallPlan { type: "tool_call"; tool: string; arguments?: Record<string, unknown> }
interface FinalPlan { type: "final"; reply: string }
type Plan = ToolCallPlan | FinalPlan;

interface DraftItem { name?: string; quantity?: number; unitPrice?: number; subtotal?: number }
interface DraftState {
  items?: DraftItem[];
  quantity?: number;
  deliveryMethod?: "pickup" | "maxim";
  address?: string;
  landmark?: string;
  contactNumber?: string;
  paymentMethod?: "cod" | "gcash";
  deliveryDate?: string;
  preferredTime?: string;
}

@Injectable()
export class AiRuntimeService {
  private readonly logger = new Logger(AiRuntimeService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly trackingBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly stateService: AiConversationStateService,
    private readonly toolRegistry: AiToolRegistryService,
    private readonly instructionsService: AiInstructionsService,
    private readonly productsService: ProductsService
  ) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct");
    const configuredTimeout = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS", "120000"));
    this.timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 120000;
    this.trackingBaseUrl = (this.config.get<string>("AI_TRACKING_BASE_URL") ?? "https://empanadahauz.com").replace(/\/$/, "");
  }

  async process(request: RuntimeRequest) {
    const fastReply = this.tryFastPath(request.message);
    if (fastReply) return { reply: fastReply };

    const instructions = await this.instructionsService.getActiveInstructionBlock();
    const replyInstructions = await this.instructionsService.getActiveReplyPromptBlock();
    const needsCatalog = this.messageNeedsCatalog(request.message);
    const products = needsCatalog ? await this.productsService.list({ availableOnly: true }) : [];
    const tools = await this.toolRegistry.getTools();
    let currentMessages = [...(request.recentMessages ?? []).slice(-12)];
    let lastToolResult: unknown;
    let lastAction: string | undefined;

    this.logger.log(`AI process context: model=${this.model} instructionsChars=${instructions.length} products=${products.length} tools=${tools.length} historyMessages=${currentMessages.length}`);

    // Most conversational requests need one planning call plus at most one recovery/tool follow-up.
    // Keeping this bounded prevents slow local models from turning one message into a long inference chain.
    for (let step = 0; step < 2; step += 1) {
      const liveState = await this.stateService.get(request.conversationId, request.customerId);

      if (step === 0 && this.isExplicitConfirmation(request.message) && liveState?.draft?.items?.length) {
        const confirmedResult = await this.createConfirmedOrder(request, liveState.draft);
        if (confirmedResult.ok) {
          return {
            reply: this.renderCreatedOrderReply(confirmedResult.order),
            tool: "create_order",
            toolResult: confirmedResult.order,
            state: await this.stateService.get(request.conversationId, request.customerId)
          };
        }

        return {
          reply: confirmedResult.reply,
          tool: "create_order",
          toolResult: { ok: false, error: confirmedResult.error },
          state: liveState
        };
      }

      const context = this.buildContext(request, products, liveState?.draft, tools);
      const plan = await this.plan({ instructions, context, messages: currentMessages, message: request.message, lastToolResult, lastAction, tools });

      this.logger.log(`AI planner step=${step + 1}: type=${plan.type}${plan.type === "tool_call" ? ` tool=${plan.tool}` : ""}`);

      if (plan.type === "final") {
        return {
          reply: this.cleanReply(plan.reply, lastAction, lastToolResult),
          tool: lastAction,
          toolResult: lastToolResult,
          state: liveState
        };
      }

      const definition = tools.find((tool) => tool.name === plan.tool);
      if (!definition) throw new BadRequestException(`AI selected an unavailable tool: ${plan.tool}`);

      const args = { ...(plan.arguments ?? {}) };
      let executionFailed = false;
      try {
        lastAction = plan.tool;
        if (definition.requiresExplicitConfirmation && args.confirmed !== true) {
          throw new BadRequestException("Explicit customer confirmation is required before this action can execute.");
        }
        lastToolResult = await this.toolRegistry.execute(plan.tool, args, {
          customerId: request.customerId,
          conversationId: request.conversationId,
          channel: request.channel
        });
        this.logger.log(`AI tool executed: ${plan.tool}`);
      } catch (error) {
        executionFailed = true;
        const errorMessage = error instanceof Error ? error.message : "Application action failed.";
        this.logger.warn(`AI tool execution failed: ${plan.tool}: ${errorMessage}`);
        lastToolResult = { ok: false, error: errorMessage };
      }

      currentMessages.push(`AI TOOL CALL: ${plan.tool} ${JSON.stringify(args)}`);
      currentMessages.push(`AI TOOL RESULT: ${JSON.stringify(lastToolResult)}`);

      if (plan.tool === "list_products" || plan.tool === "get_product" || plan.tool === "get_delivery_quote") {
        return {
          reply: this.renderReadToolReply(plan.tool, lastToolResult),
          tool: lastAction,
          toolResult: lastToolResult,
          state: await this.stateService.get(request.conversationId, request.customerId)
        };
      }

      if (plan.tool === "capture_order_draft") {
        const updatedState = await this.stateService.get(request.conversationId, request.customerId);
        const updatedDraft = this.getDraftFromToolResult(lastToolResult) ?? updatedState?.draft;
        this.logger.log(`AI pending draft saved: ${updatedDraft ? JSON.stringify(updatedDraft) : "none"}`);
        currentMessages.push(`UPDATED PENDING ORDER DRAFT: ${updatedDraft ? JSON.stringify(updatedDraft) : "none"}`);
        continue;
      }

      if (plan.tool === "create_order" && executionFailed) {
        currentMessages.push("CREATE ORDER RECOVERY REQUIRED: The application rejected the order. Do not retry create_order immediately. Re-read the pending draft and conversation, capture any missing checkout fields with capture_order_draft, then retry create_order only after the persisted draft is complete and the customer has already confirmed the order.");
        continue;
      }
    }

    // The planner already has the authoritative tool result. Only invoke a second LLM when
    // the bounded tool loop did not produce a final conversational response.
    return {
      reply: await this.generateFinalReply(request.message, replyInstructions, currentMessages, lastToolResult, lastAction),
      tool: lastAction,
      toolResult: lastToolResult,
      state: await this.stateService.get(request.conversationId, request.customerId)
    };
  }

  private tryFastPath(message: string) {
    const normalized = message.trim().toLowerCase().replace(/[!?.,;:]+$/g, "").replace(/\s+/g, " ");
    if (!normalized) return "How can I help you today? 😊";
    if (/^(hi|hello|hey|hey there|good morning|good afternoon|good evening|kumusta|kamusta)( empanada hauz| there)?$/.test(normalized)) {
      return "Hello! How can I help you today? 😊";
    }
    if (/^(thanks|thank you|thanks a lot|thank you so much|salamat|salamat kaayo|daghang salamat)$/.test(normalized)) {
      return "You're welcome! Happy to help. 😊";
    }
    if (/^(bye|goodbye|good night|see you|see ya|talk to you later|paalam)$/.test(normalized)) {
      return "Goodbye! Have a great day. 😊";
    }
    return null;
  }

  private messageNeedsCatalog(message: string) {
    return /\b(menu|product|products|empanada|flavor|flavors|price|prices|cost|buy|order|orders|pcs|pieces|pork|chicken|beef|tuna|cheese)\b/i.test(message);
  }

  private async createConfirmedOrder(request: RuntimeRequest, draft: DraftState) {
    const args: Record<string, unknown> = {
      customerName: request.customerName,
      items: draft.items,
      quantity: draft.quantity,
      deliveryMethod: draft.deliveryMethod,
      paymentMethod: draft.paymentMethod,
      address: draft.address,
      location: draft.landmark,
      phoneNumber: draft.contactNumber,
      preferredSchedule: [draft.deliveryDate, draft.preferredTime].filter(Boolean).join(" "),
      confirmed: true
    };

    try {
      const order = await this.toolRegistry.execute("create_order", args, {
        customerId: request.customerId,
        conversationId: request.conversationId,
        channel: request.channel
      });
      this.logger.log(`AI confirmed order created: customer=${request.customerId} order=${this.readOrderNumber(order) ?? "unknown"}`);
      return { ok: true as const, order };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Application action failed.";
      this.logger.warn(`AI confirmed order creation failed: ${errorMessage}`);
      return { ok: false as const, error: errorMessage, reply: this.renderOrderCreationFailure(errorMessage, draft) };
    }
  }

  private isExplicitConfirmation(message: string) {
    const normalized = message.trim().toLowerCase().replace(/[.!?]+$/g, "");
    return /^(confirm|confirmed|yes|y|okay|ok|correct|that is correct|that's correct|go ahead|proceed|submit|place it|place my order|do it|yes please)$/.test(normalized);
  }

  private renderCreatedOrderReply(order: unknown) {
    const record = (order && typeof order === "object" ? order : {}) as Record<string, unknown>;
    const orderNumber = this.readOrderNumber(order) ?? "your order";
    const id = typeof record.id === "string" ? record.id : "";
    const trackingUrl = id ? `${this.trackingBaseUrl}/track/${encodeURIComponent(id)}` : "";
    const total = typeof record.totalAmount === "number" ? ` Total: ₱${record.totalAmount.toFixed(2)}.` : "";
    const lines = [
      `Order confirmed! 🎉`,
      `Order ID: ${orderNumber}.`,
      total.trim(),
      trackingUrl ? `Track your order: ${trackingUrl}` : "",
      this.readMaximTrackingLink(order) ? `Live Maxim tracking: ${this.readMaximTrackingLink(order)}` : "",
      "Thank you! We’ll keep you updated on your order. 😊"
    ].filter(Boolean);
    return lines.join("\n");
  }

  private renderOrderCreationFailure(error: string, draft: DraftState) {
    const missing: string[] = [];
    if (!draft.items?.length) missing.push("the items and quantities");
    if (!draft.deliveryMethod) missing.push("pickup or delivery");
    if (!draft.paymentMethod) missing.push("your payment method");
    if (draft.deliveryMethod === "maxim" && !draft.address) missing.push("your delivery address");
    if (draft.deliveryMethod === "maxim" && !draft.landmark) missing.push("your landmark/location");
    if (draft.deliveryMethod === "maxim" && !draft.contactNumber) missing.push("your contact number");
    if (!draft.items?.length || !draft.quantity || draft.quantity < 10) missing.push("at least 10 pieces");

    if (missing.length) {
      const unique = [...new Set(missing)];
      return `I’m ready to place your order, but I still need ${this.joinNatural(unique)} before I can submit it. Please send those details and I’ll place the order after your confirmation. 😊`;
    }

    if (/confirmation is required/i.test(error)) {
      return "I still need your explicit confirmation before I can submit the order. Please reply CONFIRM when the details are correct.";
    }

    return `I couldn't place the order yet because the application rejected the request: ${error}. Please send the missing or corrected checkout details and I'll try again. 😊`;
  }

  private joinNatural(values: string[]) {
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
  }

  private readOrderNumber(order: unknown) {
    if (!order || typeof order !== "object") return undefined;
    const value = (order as Record<string, unknown>).orderNumber;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private readMaximTrackingLink(order: unknown) {
    if (!order || typeof order !== "object") return undefined;
    const delivery = (order as Record<string, unknown>).delivery;
    if (!delivery || typeof delivery !== "object") return undefined;
    const value = (delivery as Record<string, unknown>).trackingLink;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private buildContext(request: RuntimeRequest, products: ProductRecord[], draft: unknown, tools: AiToolDefinition[]) {
    const catalog = products.length
      ? products.map((product) => `${product.name} | price=₱${product.price} | category=${product.category} | aliases=${product.aliases.join(", ") || "none"}`).join("\n")
      : "not loaded (not needed for this request)";
    return [
      `CHANNEL: ${request.channel}`,
      `CUSTOMER: ${request.customerName || "Customer"}`,
      `CUSTOMER ID: ${request.customerId}`,
      `CONVERSATION ID: ${request.conversationId}`,
      `AVAILABLE PRODUCTS:\n${catalog}`,
      `PENDING ORDER DRAFT: ${draft ? JSON.stringify(draft) : "none"}`,
      `SYSTEM SAFETY: Application tools are authoritative. Never invent prices, availability, delivery fees, route details, order status, ownership, successful writes, or business policy. Use tools for current application facts.`
    ].join("\n\n");
  }

  private async plan(input: {
    instructions: string;
    context: string;
    messages: string[];
    message: string;
    lastToolResult?: unknown;
    lastAction?: string;
    tools: AiToolDefinition[];
  }): Promise<Plan> {
    const system = `${input.instructions || "You are the Empanada Hauz AI assistant."}

You are the semantic intent router for an application.

Use the application's available tools whenever the customer's request can be answered or completed with a tool. Decide based on meaning and conversational context, not exact phrases.

Do not use keyword lists, regular expressions, literal phrase matching, or exact wording requirements.

Delivery quote rules:
- Never expose or calculate a customer-facing fee from internal base-fare or per-kilometer configuration.
- When the customer asks for a destination-specific delivery fee, use the delivery quote tool when the destination is known.
- If a destination is not known, ask for the delivery address/landmark needed to calculate the quote.

Checkout recovery rules:
- The persisted pending order draft is the source of truth for unfinished checkout.
- A customer may provide checkout details across several messages; preserve and merge them.
- If create_order fails because required checkout information is missing, capture missing fields with the pending-order tool instead of immediately retrying.
- A previous confirmation remains valid for the same unchanged order details. If details change, ask for confirmation again.
- Never claim an order was created unless the real create_order action succeeds.

Use a final conversational response only when no available tool can satisfy the customer's intent. Never invent missing arguments.`;

    const dynamic = `AVAILABLE AI TOOLS:\n${input.tools.map((tool) => `${tool.name}: ${tool.description}\nINPUT SCHEMA: ${JSON.stringify(tool.inputSchema)}\nRISK: ${tool.risk}${tool.requiresExplicitConfirmation ? "; EXPLICIT CONFIRMATION REQUIRED" : ""}`).join("\n\n")}\n\nRUNTIME CONTEXT:\n${input.context}`;
    const user = [
      `CONVERSATION:\n${input.messages.join("\n") || "none"}`,
      `CURRENT CUSTOMER MESSAGE:\n${input.message}`,
      input.lastAction ? `LAST TOOL: ${input.lastAction}` : "",
      input.lastToolResult !== undefined ? `LAST TOOL RESULT:\n${JSON.stringify(input.lastToolResult)}` : "",
      dynamic
    ].filter(Boolean).join("\n\n");

    const response = await this.chat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 192, num_ctx: 4096 },
      tools: input.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
      messages: [{ role: "system", content: system }, { role: "user", content: user }]
    });

    const nativeToolCall = response.message?.tool_calls?.[0];
    if (nativeToolCall?.function?.name) {
      this.logger.log(`AI native tool call: ${nativeToolCall.function.name}`);
      this.logger.log(`AI native tool args: ${JSON.stringify(nativeToolCall.function.arguments ?? {})}`);
      return {
        type: "tool_call",
        tool: nativeToolCall.function.name,
        arguments: nativeToolCall.function.arguments && typeof nativeToolCall.function.arguments === "object" ? nativeToolCall.function.arguments : {}
      };
    }

    const raw = response.message?.content?.trim();
    this.logger.log(`AI planner final response: ${raw?.slice(0, 1200) ?? "<empty>"}`);
    if (!raw) throw new Error("Ollama returned an empty AI runtime plan");
    return this.parsePlan(raw);
  }

  private async generateFinalReply(message: string, instructions: string, context: string[], result: unknown, lastAction?: string) {
    const response = await this.chat({
      model: this.model,
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 160, num_ctx: 2048 },
      messages: [
        {
          role: "system",
          content: `${instructions || "You are the Empanada Hauz customer-facing assistant."}\n\nApplication results are authoritative. Never invent successful actions or data. Never expose internal pricing rules. Do not mention tools or internal implementation. Return ONLY JSON: {\"reply\":\"customer-facing reply\"}. Keep the reply concise and Messenger-friendly.`
        },
        {
          role: "user",
          content: `CURRENT MESSAGE:\n${message}\n\nCONVERSATION:\n${context.slice(-8).join("\n")}\n\nLAST TOOL:\n${lastAction || "none"}\n\nLAST APPLICATION RESULT:\n${JSON.stringify(result)}`
        }
      ]
    });
    const raw = response.message?.content?.trim() || "";
    try {
      const parsed = JSON.parse(this.extractJson(raw) ?? raw) as { reply?: unknown };
      if (typeof parsed.reply === "string" && parsed.reply.trim()) return this.cleanReply(parsed.reply, lastAction, result);
    } catch {}
    return this.cleanReply(raw, lastAction, result);
  }

  private parsePlan(raw: string): Plan {
    const candidates = [raw.trim(), this.extractJson(raw) ?? ""];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate) as Partial<Plan> & { arguments?: Record<string, unknown> };
        if (parsed.type === "tool_call" && typeof parsed.tool === "string") return { type: "tool_call", tool: parsed.tool, arguments: parsed.arguments && typeof parsed.arguments === "object" ? parsed.arguments : {} };
        if (parsed.type === "final" && typeof parsed.reply === "string") return { type: "final", reply: parsed.reply };
      } catch {}
    }
    return { type: "final", reply: raw };
  }

  private extractJson(raw: string) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    return start >= 0 && end > start ? raw.slice(start, end + 1) : undefined;
  }

  private cleanReply(value: string, lastAction?: string, lastToolResult?: unknown) {
    const text = value.replace(/^```(?:text|markdown|json)?/i, "").replace(/```$/i, "").trim();
    if (!text) return this.fallbackReply(lastAction, lastToolResult);
    if (text.includes('"type":"tool_call"') || text.includes('"type": "tool_call"') || /\bAI\s+TOOL\s+CALL\b/i.test(text)) return this.fallbackReply(lastAction, lastToolResult);
    if (/^\{\s*"type"\s*:\s*"(?:tool_call|final)"/i.test(text)) return this.fallbackReply(lastAction, lastToolResult);
    if (/\bbase\s+fare\b|\bper[- ]kilometer\b|\bper[- ]km\b/i.test(text) && lastAction !== "get_delivery_quote") return this.fallbackReply(lastAction, lastToolResult);
    return text;
  }
}
