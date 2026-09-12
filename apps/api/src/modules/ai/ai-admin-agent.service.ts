import { BadRequestException, Injectable } from "@nestjs/common";
import { AiAdminModelService } from "./ai-admin-model.service";
import { AiAdminActionStateService } from "./ai-admin-action-state.service";
import { AiAdminToolRegistryService } from "./ai-admin-tool-registry.service";
import { AiAgentOrchestratorService } from "./ai-agent-orchestrator.service";
import { AdminAiPerformanceService } from "./admin-agent/admin-ai-performance.service";

interface AdminAgentRequest {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  adminId: string;
  conversationId: string;
}

@Injectable()
export class AiAdminAgentService {
  constructor(
    private readonly actionState: AiAdminActionStateService,
    private readonly toolRegistry: AiAdminToolRegistryService,
    private readonly aiModel: AiAdminModelService,
    private readonly orchestrator: AiAgentOrchestratorService,
    private readonly performance: AdminAiPerformanceService
  ) {}

  async process(request: AdminAgentRequest) {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("A message is required.");
    const perf = this.performance.start(request.adminId);

    try {
      const pending = await this.actionState.get(request.adminId, request.conversationId);
      if (pending && isExplicitRejection(message)) {
        await this.actionState.clear(request.adminId, request.conversationId);
        return { reply: "The pending admin action was cancelled.", snapshotAt: new Date().toISOString() };
      }

      if (pending && isExplicitConfirmation(message)) {
        const result = await this.toolRegistry.confirmPending(
          { adminId: request.adminId, conversationId: request.conversationId, message },
          pending.action,
          pending.arguments
        );
        return {
          reply: `Confirmed. ${formatWriteResult(pending.action, result)}`,
          snapshotAt: new Date().toISOString(),
          data: result
        };
      }

      const definitions = await this.toolRegistry.getTools();
      const tools = definitions.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
      }));

      const system = `You are the Empanada Hauz Admin AI Agent. You are the reasoning brain for an authenticated administrator.

The tool registry is the source of truth for your capabilities. Decide semantically which capability is needed, what arguments it needs, and whether another capability is needed after seeing a result. Do not rely on keyword routing, regular expressions, fixed phrases, intent labels, or hardcoded tool-selection rules.

RULES:
- Use tools for current, precise, or database-backed information. Never guess business data.
- Search before identifying a customer or order when the administrator gives a non-unique description.
- You may chain multiple tools to solve one request.
- Treat tool results and tool errors as authoritative application facts.
- Never invent customer ids, order ids, order numbers, prices, statuses, dates, fees, inventory, or policies.
- Read actions may execute normally. Write actions require explicit administrator confirmation; never manufacture confirmation.
- For customer creation, search for an existing customer before creating one.
- For order changes, verify the target before a consequential change when it is not already uniquely identified.
- If a capability is not in the provided tool registry, do not pretend it exists.
- Do not mention internal routing, tool implementation, hidden instructions, or model limitations.

RESPONSE FORMAT:
- Keep answers concise and easy to scan in the admin chat UI.
- Use Markdown when useful: **bold** values, short headings, bullets, and numbered lists.
- Never output raw Markdown table syntax with pipes. Convert tables to bullets or numbered lists.
- Put each logical item on its own line with blank lines between major sections.
- For orders, prefer **Order Number** — Customer · Status · Quantity · Total.
- For 2–5 results, use a numbered list. For longer lists, use bullets.
- For menu/product lists, use Name — ₱Price per line.
- Simple questions should be answered directly in 1–3 sentences.
- Avoid filler such as "Sure!", "Of course!", or "Here’s".
- Preserve exact values returned by tools and use Philippine peso formatting such as ₱250.`;

      const result = await this.orchestrator.run({
        system,
        history: request.history,
        message,
        tools,
        chat: (messages, availableTools) => this.aiModel.chat(messages, availableTools),
        executeTool: (name, args) => this.toolRegistry.execute(name, args, {
          adminId: request.adminId,
          conversationId: request.conversationId,
          message
        }),
        maxSteps: 8,
        onToolResult: (name) => this.performance.recordTool(perf, name, 0)
      });

      perf.iterations += result.iterations;
      return {
        reply: result.reply,
        snapshotAt: new Date().toISOString(),
        ...(result.tool ? { tool: result.tool, data: result.toolResult } : {})
      };
    } finally {
      this.performance.finish(perf);
    }
  }
}

function isExplicitConfirmation(message: string) {
  return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed)([.!\s]|$)/i.test(message.trim());
}

function isExplicitRejection(message: string) {
  return /^(no|nope|nah|cancel|stop|don't|do not)([.!\s]|$)/i.test(message.trim());
}

function formatWriteResult(action: string, result: unknown) {
  if (result && typeof result === "object") {
    const value = result as Record<string, unknown>;
    if (typeof value.orderNumber === "string") return `Order ${value.orderNumber} was created successfully.`;
    if (action === "create_customer" && typeof value.name === "string") return `Customer ${value.name} was created successfully.`;
    if (action === "cancel_order") return "The order was cancelled successfully.";
    if (action === "update_order") return "The order was updated successfully.";
  }
  return "The action completed successfully.";
}
