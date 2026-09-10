import { BadRequestException, Injectable } from "@nestjs/common";
import { AiApplicationToolsService, AiApplicationToolName } from "./ai-application-tools.service";
import { AiAdminModelService } from "./ai-admin-model.service";
import { AiAdminAnalyticsToolsService } from "./ai-admin-analytics-tools.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";

interface AdminAgentRequest { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> }
interface AdminToolCall { name: string; arguments: Record<string, unknown>; parseError?: string }

@Injectable()
export class AiAdminAgentService {
  constructor(
    private readonly applicationTools: AiApplicationToolsService,
    private readonly analyticsTools: AiAdminAnalyticsToolsService,
    private readonly registry: AiToolRegistryService,
    private readonly aiModel: AiAdminModelService
  ) {}

  async process(request: AdminAgentRequest) {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("A message is required.");

    const registryTools = await this.registry.getTools();
    const registryToolMap = new Map(registryTools.map((tool) => [tool.name, tool]));
    const tools = registryTools
      .filter((tool) => !tool.requiresCustomerContext && tool.name !== "get_current_datetime" && tool.name !== "delete_order")
      .map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
      }));
    tools.push(...this.applicationToolDefinitions());
    tools.push({
      type: "function",
      function: {
        name: "get_order_metrics",
        description: "Count and summarize orders for today, this week, or this month. Use this for order counts, completed orders, active orders, cancelled orders, pieces sold, and revenue.",
        parameters: {
          type: "object",
          properties: {
            range: { type: "string", enum: ["today", "week", "month"] }
          },
          additionalProperties: false
        }
      }
    });

    const system = `You are the private Empanada Hauz Admin AI Agent. You assist an authenticated administrator, not a customer.

You have access only to the tools supplied in this request. Use those tools as the authoritative source for current or precise business information.

GROUNDING RULES:
- Use only tools that actually appear in the tools list. Never invent, simulate, or describe a tool that is not supplied.
- Never invent business data, prices, statuses, customer identities, order details, dates, balances, fees, analytics, or inventory levels.
- Never invent or assume business policies, thresholds, deadlines, cancellation rules, refund rules, or authorization requirements.
- For current or precise information, call the relevant tool before answering.
- Never claim that records were found or that none were found unless a tool actually returned that result.
- If the available tools cannot retrieve the requested information, say so clearly.
- Never guess customerId, order id, or order number. Use an identifier explicitly provided by the administrator or returned by a tool.

WRITE SAFETY:
- Read actions may execute normally.
- Consequential or destructive actions require explicit administrator confirmation in the current request.
- Never manufacture confirmed=true.
- Never treat an implied request as confirmation.
- Execute a confirmed write only once.
- After a write, report the actual application result; do not invent success.

TOOL USE:
- Prefer the narrowest relevant tool.
- Use multiple tools when a request requires multiple verified facts.
- Treat tool errors as facts about what the application could not do, not as permission to guess.
- Keep the final response concise and operationally useful.`;

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: system },
      ...(request.history ?? []).slice(-12).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: message }
    ];
    const executedWrites = new Set<string>();

    for (let step = 0; step < 6; step += 1) {
      const response = await this.aiModel.chat(messages, tools);
      const toolCalls = this.readToolCalls(response);
      const content = this.readContent(response);
      if (!toolCalls.length) return { reply: content || "I couldn't produce a response.", snapshotAt: new Date().toISOString() };

      messages.push({
        role: "assistant",
        content: content || "",
        tool_calls: toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) }
        }))
      });

      for (const call of toolCalls) {
        try {
          if (call.parseError) throw new BadRequestException(call.parseError);
          const result = await this.executeTool(call.name, call.arguments, message, registryToolMap, executedWrites);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Tool execution failed.";
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: errorMessage }) });
        }
      }
    }

    return { reply: "I reached the tool execution limit before completing that request. Please narrow the request and try again.", snapshotAt: new Date().toISOString() };
  }

  private applicationToolDefinitions() {
    const definitions: Array<[AiApplicationToolName, string, Record<string, unknown>]> = [
      ["get_current_datetime", "Get the current Manila date and time. Use this for today, tomorrow, and relative dates.", { type: "object", properties: {}, additionalProperties: false }],
      ["get_order_summary", "Read an order by customerId and order number or id.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }],
      ["get_my_orders", "Read recent orders for a customer.", { type: "object", properties: { customerId: { type: "string" }, limit: { type: "number" } }, required: ["customerId"], additionalProperties: false }],
      ["check_order_status", "Read the current status of a customer's order.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }],
      ["create_order", "Create an order. Requires explicit administrator confirmation and complete order data.", { type: "object", properties: { customerId: { type: "string" }, customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string" }, paymentMethod: { type: "string" }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false }],
      ["update_order", "Update an existing order only after explicit administrator confirmation.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, status: { type: "string" }, preferredSchedule: { type: "string" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false }],
      ["cancel_order", "Cancel a queued customer order only after explicit administrator confirmation.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false }]
    ];
    return definitions.map(([name, description, parameters]) => ({ type: "function", function: { name, description, parameters } }));
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    currentMessage: string,
    registryToolMap: Map<string, any>,
    executedWrites: Set<string>
  ) {
    if (name === "get_order_metrics") {
      const range = args.range === "week" || args.range === "month" ? args.range : "today";
      return this.analyticsTools.getOrderMetrics(range);
    }

    const applicationNames = new Set<string>(["get_current_datetime", "get_order_summary", "get_my_orders", "check_order_status", "create_order", "update_order", "cancel_order"]);
    if (applicationNames.has(name)) {
      const write = ["create_order", "update_order", "cancel_order"].includes(name);
      if (write) {
        if (!isExplicitConfirmation(currentMessage)) throw new BadRequestException("Explicit administrator confirmation is required in the current message before this write action.");
        if (args.confirmed !== true) throw new BadRequestException("Explicit administrator confirmation is required before this write action.");
        const fingerprint = `${name}:${stableArguments(args)}`;
        if (executedWrites.has(fingerprint)) return { ok: true, deduplicated: true, message: "This write action was already executed during the current request." };
        executedWrites.add(fingerprint);
      }
      return this.applicationTools.execute(name as AiApplicationToolName, args);
    }

    const tool = registryToolMap.get(name);
    if (!tool) throw new BadRequestException(`Unknown admin tool: ${name}`);
    if (tool.risk === "write") {
      if (!isExplicitConfirmation(currentMessage)) throw new BadRequestException("Explicit administrator confirmation is required in the current message before this write action.");
      if (args.confirmed !== true) throw new BadRequestException("Explicit administrator confirmation is required before this write action.");
      const fingerprint = `${name}:${stableArguments(args)}`;
      if (executedWrites.has(fingerprint)) return { ok: true, deduplicated: true, message: "This write action was already executed during the current request." };
      executedWrites.add(fingerprint);
    }
    return this.registry.execute(name, args, { customerId: "admin", channel: "admin" });
  }

  private readContent(response: unknown) {
    const value = response as { content?: string; message?: { content?: string }; choices?: Array<{ message?: { content?: string } }> };
    return value?.content?.trim() || value?.message?.content?.trim() || value?.choices?.[0]?.message?.content?.trim() || "";
  }

  private readToolCalls(response: unknown): Array<AdminToolCall & { id: string }> {
    type ToolCallShape = { id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } };
    type ResponseShape = {
      tool_calls?: ToolCallShape[];
      message?: { tool_calls?: ToolCallShape[] };
      choices?: Array<{ message?: { tool_calls?: ToolCallShape[] } }>;
    };

    const value = response as ResponseShape;
    const calls = value?.tool_calls ?? value?.message?.tool_calls ?? value?.choices?.[0]?.message?.tool_calls ?? [];
    return calls.flatMap((call, index) => {
      const name = call.function?.name?.trim();
      if (!name) return [];
      const id = call.id || `admin-tool-${index}`;
      if (call.function?.arguments && typeof call.function.arguments !== "string") {
        return [{ id, name, arguments: call.function.arguments }];
      }
      try {
        const rawArguments = call.function?.arguments ?? "{}";
        const parsed = typeof rawArguments === "string" ? JSON.parse(rawArguments || "{}") : rawArguments;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return [{ id, name, arguments: {}, parseError: "Tool arguments must be a JSON object." }];
        }
        return [{ id, name, arguments: parsed as Record<string, unknown> }];
      } catch {
        return [{ id, name, arguments: {}, parseError: "The model returned invalid JSON tool arguments." }];
      }
    });
  }
}

function isExplicitConfirmation(message: string) {
  return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed)([.!\s]|$)/i.test(message.trim());
}

function stableArguments(args: Record<string, unknown>) {
  return JSON.stringify(sortObject(args));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = sortObject((value as Record<string, unknown>)[key]);
    return result;
  }, {});
}
