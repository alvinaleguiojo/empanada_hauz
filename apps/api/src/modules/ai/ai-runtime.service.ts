import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { AiAgentOrchestratorService } from "./ai-agent-orchestrator.service";

interface RuntimeRequest {
  customerId: string;
  conversationId: string;
  channel: string;
  customerName?: string;
  message: string;
  recentMessages?: string[];
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
    private readonly orchestrator: AiAgentOrchestratorService
  ) {
    this.baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct");
    const configuredTimeout = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS", "120000"));
    this.timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 120000;
  }

  async process(request: RuntimeRequest) {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("A message is required.");

    const instructions = await this.instructionsService.getActiveInstructionBlock();
    const replyInstructions = await this.instructionsService.getActiveReplyPromptBlock();
    const tools = await this.toolRegistry.getTools();
    const liveState = await this.stateService.get(request.conversationId, request.customerId);

    const system = `${instructions || "You are the Empanada Hauz customer assistant."}

You are the reasoning brain for a customer conversation.

The application exposes live capabilities through the tool registry. Decide semantically when a capability is needed. Do not use keyword routing, regular expressions, fixed phrases, or exact wording requirements.

RULES:
- Use live tools for current products, prices, delivery quotes, order status, customer order information, and order actions.
- Never invent prices, availability, delivery fees, route details, order status, dates, or policies.
- When a customer is building an order, persist the information with capture_order_draft. Preserve existing draft fields when the customer provides only a follow-up detail.
- Do not create a real order until the customer has explicitly confirmed the complete checkout details.
- If checkout information is missing, ask only for the missing information needed to continue.
- You may chain tools when one result is needed by another tool.
- Tool results are authoritative. If a tool fails, explain the application error naturally and do not fabricate a replacement result.
- A real order action must be performed by the corresponding application tool. Never simulate an action in your reply.
- Never claim that an order was created, cancelled, updated, rescheduled, deleted, submitted, accepted, received, completed, or otherwise changed unless the corresponding application tool was actually called and returned a successful result.
- Customer confirmation such as "yes", "okay", or "confirm" is context-dependent. Do not treat every confirmation as approval to create an order. Use the conversation context and the requested action.
- Never expose internal pricing configuration or internal tool implementation details.
- Customer-facing replies must be normal conversational text, not JSON, JavaScript objects, tool calls, XML, or internal application payloads.
- If a model response is wrapped as JSON such as {"message":"..."} or {"reply":"..."}, output only the customer-facing text value.
- Respond in the customer's language when practical. If the customer uses Cebuano, respond naturally in Cebuano.

${replyInstructions || "Keep replies concise, friendly, and easy to read."}`;

    const history = (request.recentMessages ?? []).slice(-16).map((content) => {
      const separator = content.indexOf(": ");
      if (separator > 0) {
        const speaker = content.slice(0, separator).toLowerCase();
        return { role: speaker === "assistant" ? "assistant" as const : "user" as const, content: content.slice(separator + 2) };
      }
      return { role: "user" as const, content };
    });

    const context = [
      `CHANNEL: ${request.channel}`,
      `CUSTOMER: ${request.customerName || "Customer"}`,
      `CUSTOMER ID: ${request.customerId}`,
      `CONVERSATION ID: ${request.conversationId}`,
      `PENDING ORDER DRAFT: ${liveState?.draft ? JSON.stringify(liveState.draft) : "none"}`,
      `AVAILABLE CAPABILITIES:\n${tools.map((tool) => `${tool.name}: ${tool.description}\nINPUT: ${JSON.stringify(tool.inputSchema)}\nRISK: ${tool.risk}${tool.requiresExplicitConfirmation ? "; EXPLICIT CONFIRMATION REQUIRED" : ""}`).join("\n\n")}`
    ].join("\n\n");

    const result = await this.orchestrator.run({
      system: `${system}\n\nRUNTIME CONTEXT:\n${context}`,
      history,
      message,
      tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
      chat: (messages, availableTools) => this.chat(messages, availableTools),
      executeTool: (name, args) => this.toolRegistry.execute(name, args, {
        customerId: request.customerId,
        conversationId: request.conversationId,
        channel: request.channel
      }),
      maxSteps: 8
    });

    return {
      reply: result.reply,
      tool: result.tool,
      toolResult: result.toolResult,
      state: await this.stateService.get(request.conversationId, request.customerId)
    };
  }

  async chat(messages: Array<Record<string, unknown>>, tools: Array<Record<string, unknown>>) {
    const response = await this.fetchOllama({ model: this.model, messages, tools, tool_choice: "auto" });
    return response;
  }

  private async fetchOllama(body: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Ollama runtime request failed: ${response.status} ${text}`);
      const parsed = JSON.parse(text) as { choices?: Array<{ message?: unknown }> };
      return parsed.choices?.[0]?.message ?? { content: "" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Ollama did not respond within ${Math.round(this.timeoutMs / 1000)} seconds.`);
      }
      throw new ServiceUnavailableException("AI runtime is unavailable. Check the local model service or internet connection and try again.");
    } finally {
      clearTimeout(timeout);
    }
  }

}
