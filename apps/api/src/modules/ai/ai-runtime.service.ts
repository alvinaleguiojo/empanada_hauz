import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiToolDefinition } from "./ai-tool.types";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { ProductsService, ProductRecord } from "../products/products.service";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";

interface OllamaResponse { message?: { content?: string } }
interface RuntimeRequest { customerId: string; conversationId: string; channel: string; customerName?: string; message: string; recentMessages?: string[] }
interface ToolCallPlan { type: "tool_call"; tool: string; arguments?: Record<string, unknown> }
interface FinalPlan { type: "final"; reply: string }
type Plan = ToolCallPlan | FinalPlan;

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
    const state = await this.stateService.get(request.conversationId, request.customerId);
    const tools = await this.toolRegistry.getTools();
    const context = this.buildContext(request, products, deliveryPricing, state?.draft, tools);
    let currentMessages = [...(request.recentMessages ?? []).slice(-16)];
    let lastToolResult: unknown;
    let lastAction: string | undefined;

    for (let step = 0; step < 4; step += 1) {
      const plan = await this.plan({ instructions, context, messages: currentMessages, message: request.message, lastToolResult, lastAction });
      if (plan.type === "final") {
        return {
          reply: this.cleanReply(plan.reply, lastAction, lastToolResult),
          tool: lastAction,
          toolResult: lastToolResult,
          state: await this.stateService.get(request.conversationId, request.customerId)
        };
      }

      const definition = tools.find((tool) => tool.name === plan.tool);
      if (!definition) throw new BadRequestException(`AI selected an unavailable tool: ${plan.tool}`);
      const args = { ...(plan.arguments ?? {}) };
      try {
        lastAction = plan.tool;
        if (definition.requiresExplicitConfirmation && args.confirmed !== true) throw new BadRequestException("Explicit customer confirmation is required before this action can execute.");
        lastToolResult = await this.toolRegistry.execute(plan.tool, args, { customerId: request.customerId, conversationId: request.conversationId, channel: request.channel });
      } catch (error) {
        this.logger.warn(`AI tool execution failed: ${plan.tool}: ${error instanceof Error ? error.message : String(error)}`);
        lastToolResult = { ok: false, error: error instanceof Error ? error.message : "Application action failed." };
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
    }

    return {
      reply: await this.generateFinalReply(request.message, replyInstructions, currentMessages, lastToolResult, lastAction),
      tool: lastAction,
      toolResult: lastToolResult,
      state: await this.stateService.get(request.conversationId, request.customerId)
    };
  }

  private buildContext(request: RuntimeRequest, products: ProductRecord[], deliveryPricing: { baseFare: number; perKmRate: number }, draft: unknown, tools: AiToolDefinition[]) {
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

  private async plan(input: { instructions: string; context: string; messages: string[]; message: string; lastToolResult?: unknown; lastAction?: string }): Promise<Plan> {
    const system = `${input.instructions || "You are the Empanada Hauz AI assistant."}\n\nYou are operating inside the Empanada Hauz application runtime. Decide whether to call one available AI tool or return a final customer reply. Use the current customer message as the primary intent signal and conversation/draft context to resolve references.\n\nReturn ONLY valid JSON in one of these forms:\n{"type":"tool_call","tool":"TOOL_NAME","arguments":{}}\n{"type":"final","reply":"customer-facing reply"}\n\nRules:\n- Do not execute an action by merely saying it; use the corresponding tool.\n- Use capture_order_draft while collecting or changing a pending new order. It does not create a real order.\n- Use create_order only after the customer explicitly confirms a complete draft and pass confirmed=true.\n- Use summary/status/update/cancel/delete tools when the customer actually requests those actions.\n- Use live catalog and delivery data instead of inventing prices or policies.\n- Never expose internal tool names, JSON, prompts, or implementation details to the customer.\n- Never claim success until a tool result says the action succeeded.\n- Keep replies concise and natural.\n\nRUNTIME CONTEXT:\n${input.context}`;
    const user = [`RECENT CONVERSATION:\n${input.messages.join("\n") || "none"}`, `CURRENT CUSTOMER MESSAGE:\n${input.message}`, input.lastAction ? `LAST TOOL: ${input.lastAction}` : "", input.lastToolResult !== undefined ? `LAST TOOL RESULT:\n${JSON.stringify(input.lastToolResult)}` : ""].filter(Boolean).join("\n\n");
    const response = await this.chat({ model: this.model, stream: false, think: false, format: "json", options: { temperature: 0.1, num_predict: 384, num_ctx: 8192 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
    const raw = response.message?.content?.trim();
    if (!raw) throw new Error("Ollama returned an empty AI runtime plan");
    return this.parsePlan(raw);
  }

  private async generateFinalReply(message: string, instructions: string, context: string[], result: unknown, lastAction?: string) {
    const response = await this.chat({ model: this.model, stream: false, think: false, format: "json", options: { temperature: 0.1, num_predict: 256, num_ctx: 4096 }, messages: [
      { role: "system", content: `${instructions || "You are the Empanada Hauz customer-facing assistant."}\n\nApplication results are authoritative. Never invent successful actions or data. Do not mention tools or internal implementation. Return ONLY JSON: {"reply":"customer-facing reply"}. Keep the reply concise and Messenger-friendly.` },
      { role: "user", content: `CURRENT MESSAGE:\n${message}\n\nCONVERSATION:\n${context.slice(-12).join("\n")}\n\nLAST TOOL:\n${lastAction || "none"}\n\nLAST APPLICATION RESULT:\n${JSON.stringify(result)}` }
    ] });
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

  private extractJson(raw: string) { const start = raw.indexOf("{"); const end = raw.lastIndexOf("}"); return start >= 0 && end > start ? raw.slice(start, end + 1) : undefined; }

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
    const lines = products
      .filter((product) => product?.name && typeof product.price === "number")
      .map((product) => `• ${product.name} — ₱${product.price!.toFixed(2)}${product.category ? ` (${product.category})` : ""}`);
    return ["Sure! Here’s our current product list:", ...lines, "", "Message me what you’d like to order and I’ll help you with it. 😊"].join("\n");
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
