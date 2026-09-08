import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiToolDefinition } from "./ai-tool.types";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { ProductsService, ProductRecord } from "../products/products.service";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";

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

  constructor(
    private readonly config: ConfigService,
    private readonly stateService: AiConversationStateService,
    private readonly toolRegistry: AiToolRegistryService,
    private readonly instructionsService: AiInstructionsService,
    private readonly productsService: ProductsService,
    private readonly deliveryNetworkService: DeliveryNetworkService
  ) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct");
    const configuredTimeout = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS", "120000"));
    this.timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 120000;
  }

  async process(request: RuntimeRequest) {
    const instructions = await this.instructionsService.getActiveInstructionBlock();
    const replyInstructions = await this.instructionsService.getActiveReplyPromptBlock();
    const products = await this.productsService.list({ availableOnly: true });
    const deliveryPricing = await this.deliveryNetworkService.getDeliveryPricing();
    const tools = await this.toolRegistry.getTools();
    let currentMessages = [...(request.recentMessages ?? []).slice(-16)];
    let lastToolResult: unknown;
    let lastAction: string | undefined;

    this.logger.log(`AI process context: model=${this.model} instructionsChars=${instructions.length} products=${products.length} tools=${tools.length} historyMessages=${currentMessages.length}`);

    for (let step = 0; step < 4; step += 1) {
      const liveState = await this.stateService.get(request.conversationId, request.customerId);
      const context = this.buildContext(request, products, deliveryPricing, liveState?.draft, tools);
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

      if (plan.tool === "list_products" || plan.tool === "get_product" || plan.tool === "get_delivery_pricing") {
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

    return {
      reply: await this.generateFinalReply(request.message, replyInstructions, currentMessages, lastToolResult, lastAction),
      tool: lastAction,
      toolResult: lastToolResult,
      state: await this.stateService.get(request.conversationId, request.customerId)
    };
  }

  private buildContext(
    request: RuntimeRequest,
    products: ProductRecord[],
    deliveryPricing: { baseFare: number; perKmRate: number },
    draft: unknown,
    tools: AiToolDefinition[]
  ) {
    return [
      `CHANNEL: ${request.channel}`,
      `CUSTOMER: ${request.customerName || "Customer"}`,
      `CUSTOMER ID: ${request.customerId}`,
      `CONVERSATION ID: ${request.conversationId}`,
      `AVAILABLE PRODUCTS:\n${products.map((product) => `${product.name} | price=₱${product.price} | category=${product.category} | aliases=${product.aliases.join(", ") || "none"}`).join("\n") || "none"}`,
      `DELIVERY PRICING: baseFare=₱${deliveryPricing.baseFare}; perKmRate=₱${deliveryPricing.perKmRate}`,
      `PENDING ORDER DRAFT: ${draft ? JSON.stringify(draft) : "none"}`,
      `AVAILABLE AI TOOLS:\n${tools.map((tool) => `${tool.name}: ${tool.description}\nINPUT: ${JSON.stringify(tool.inputSchema)}\nRISK: ${tool.risk}${tool.requiresExplicitConfirmation ? "; EXPLICIT CONFIRMATION REQUIRED" : ""}`).join("\n\n")}`,
      `SYSTEM SAFETY: Application tools are authoritative. Never invent prices, availability, order status, ownership, successful writes, or business policy. Use tools for current application facts.`
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

Do not use keyword lists, regular expressions, literal phrase matching, or exact wording requirements. A customer may ask the same thing in many different ways.

Examples of intent:
- A request to browse, see, view, get, or know the shop's menu, products, flavors, offerings, or current prices requires the live product catalog tool.
- A request about one specific product requires the corresponding product lookup tool.
- A request about delivery charges requires the delivery-pricing tool.
- A message that provides information for an unfinished purchase should use the pending-order tool.
- A request to change an existing order should use the order-update tool.
- A request to cancel or delete an existing order should use the corresponding action, subject to its confirmation requirement.

These are semantic examples, not keyword rules. Generalize from intent.

Checkout recovery rules:
- The persisted pending order draft is the source of truth for unfinished checkout.
- A customer may provide checkout details across several messages; preserve and merge them.
- If create_order fails because required checkout information is missing, do not treat the conversation as complete and do not immediately retry create_order.
- Use the pending-order action to capture missing fields from the conversation and persisted state.
- After repairing the pending draft, retry create_order only when the order is complete and the customer has already explicitly confirmed it.
- A previous customer confirmation remains valid for the same unchanged order details. If the order details change, ask for confirmation again.

Use a final conversational response only when no available tool can satisfy the customer's intent.

Never invent missing arguments. Only provide arguments supported by the customer message or conversation state.

AVAILABLE AI TOOLS:
${input.tools.map((tool) => `${tool.name}: ${tool.description}\nINPUT SCHEMA: ${JSON.stringify(tool.inputSchema)}\nRISK: ${tool.risk}${tool.requiresExplicitConfirmation ? "; EXPLICIT CONFIRMATION REQUIRED" : ""}`).join("\n\n")}

RUNTIME CONTEXT:
${input.context}`;

    const user = [
      `CONVERSATION:\n${input.messages.join("\n") || "none"}`,
      `CURRENT CUSTOMER MESSAGE:\n${input.message}`,
      input.lastAction ? `LAST TOOL: ${input.lastAction}` : "",
      input.lastToolResult !== undefined ? `LAST TOOL RESULT:\n${JSON.stringify(input.lastToolResult)}` : ""
    ].filter(Boolean).join("\n\n");

    const response = await this.chat({
      model: this.model,
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 256, num_ctx: 16384 },
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      })),
      messages: [{ role: "system", content: system }, { role: "user", content: user }]
    });

    const nativeToolCall = response.message?.tool_calls?.[0];
    if (nativeToolCall?.function?.name) {
      const argumentsValue = nativeToolCall.function.arguments;
      this.logger.log(`AI native tool call: ${nativeToolCall.function.name}`);
      this.logger.log(`AI native tool args: ${JSON.stringify(argumentsValue ?? {})}`);
      return {
        type: "tool_call",
        tool: nativeToolCall.function.name,
        arguments: argumentsValue && typeof argumentsValue === "object" ? argumentsValue : {}
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
      options: { temperature: 0.1, num_predict: 256, num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: `${instructions || "You are the Empanada Hauz customer-facing assistant."}\n\nApplication results are authoritative. Never invent successful actions or data. Do not mention tools or internal implementation. Return ONLY JSON: {"reply":"customer-facing reply"}. Keep the reply concise and Messenger-friendly.`
        },
        {
          role: "user",
          content: `CURRENT MESSAGE:\n${message}\n\nCONVERSATION:\n${context.slice(-12).join("\n")}\n\nLAST TOOL:\n${lastAction || "none"}\n\nLAST APPLICATION RESULT:\n${JSON.stringify(result)}`
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
        if (parsed.type === "tool_call" && typeof parsed.tool === "string") {
          return {
            type: "tool_call",
            tool: parsed.tool,
            arguments: parsed.arguments && typeof parsed.arguments === "object" ? parsed.arguments : {}
          };
        }
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
    if (text.includes('"type":"tool_call"') || text.includes('"type": "tool_call"') || /\bAI\s+TOOL\s+CALL\b/i.test(text)) {
      return this.fallbackReply(lastAction, lastToolResult);
    }
    if (/^\{\s*"type"\s*:\s*"(?:tool_call|final)"/i.test(text)) return this.fallbackReply(lastAction, lastToolResult);
    return text;
  }

  private fallbackReply(lastAction?: string, lastToolResult?: unknown) {
    if (lastAction === "list_products" || lastAction === "get_product" || lastAction === "get_delivery_pricing") return this.renderReadToolReply(lastAction, lastToolResult);
    if (lastAction === "capture_order_draft") return this.renderDraftReply(lastToolResult);
    return "How can I help you with your Empanada Hauz order? 😊";
  }

  private renderReadToolReply(tool: string, result: unknown) {
    if (tool === "get_delivery_pricing") {
      const pricing = result as { baseFare?: number; perKmRate?: number } | null;
      if (!pricing || typeof pricing.baseFare !== "number" || typeof pricing.perKmRate !== "number") return "I couldn’t retrieve the current delivery pricing right now. Please try again in a moment.";
      return `Our current delivery rate is ₱${pricing.baseFare.toFixed(2)} base fare + ₱${pricing.perKmRate.toFixed(2)} per km.`;
    }
    if (tool === "get_product") {
      const product = result as { name?: string; price?: number; category?: string } | null;
      if (!product?.name || typeof product.price !== "number") return "I couldn’t retrieve that product right now. Please try again in a moment.";
      return `${product.name} — ₱${product.price.toFixed(2)}${product.category ? ` (${product.category})` : ""}.`;
    }
    const products = Array.isArray(result) ? result as Array<{ name?: string; price?: number; category?: string }> : [];
    if (!products.length) return "We don’t have any available products listed right now.";
    const lines = products.filter((product) => product?.name && typeof product.price === "number").map((product) => `• ${product.name} — ₱${product.price!.toFixed(2)}${product.category ? ` (${product.category})` : ""}`);
    return ["Sure! Here’s our current product list:", ...lines, "", "Message me what you’d like to order and I’ll help you with it. 😊"].join("\n");
  }

  private getDraftFromToolResult(result: unknown): DraftState | undefined {
    if (!result || typeof result !== "object") return undefined;
    const candidate = result as { draft?: DraftState };
    return candidate.draft && typeof candidate.draft === "object" ? candidate.draft : undefined;
  }

  private renderDraftReply(result: unknown) {
    const draft = this.getDraftFromToolResult(result);
    const items = draft?.items ?? [];
    const quantity = draft?.quantity ?? items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    if (!items.length) return "I can help with your order. What product and quantity would you like?";
    const lines = items.map((item) => `• ${item.name} × ${item.quantity}${typeof item.subtotal === "number" ? ` — ₱${item.subtotal.toFixed(2)}` : ""}`);
    const total = items.reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0);
    const delivery = draft?.deliveryMethod ? `Delivery: ${draft.deliveryMethod === "maxim" ? "Maxim" : "Pickup"}` : undefined;
    return ["Here’s your current order:", ...lines, `Total: ${quantity} pcs${total > 0 ? ` — ₱${total.toFixed(2)}` : ""}`, delivery, "What would you like to provide next for the order? 😊"].filter(Boolean).join("\n");
  }

  private async chat(body: Record<string, unknown>): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify({ ...body, keep_alive: "10m" }) });
      if (!response.ok) throw new Error(`Ollama runtime request failed: ${response.status} ${await response.text()}`);
      return await response.json() as OllamaResponse;
    } finally { clearTimeout(timeout); }
  }
}
