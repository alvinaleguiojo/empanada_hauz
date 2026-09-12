import { BadRequestException, Injectable } from "@nestjs/common";
import { AiApplicationToolsService, AiApplicationToolName } from "./ai-application-tools.service";
import { AiAdminModelService } from "./ai-admin-model.service";
import { AiAdminAnalyticsToolsService } from "./ai-admin-analytics-tools.service";
import { AiAdminActionStateService } from "./ai-admin-action-state.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { CustomersService } from "../customers/customers.service";

interface AdminAgentRequest {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  adminId: string;
  conversationId: string;
}

type ToolCall = { id: string; name: string; arguments: Record<string, unknown>; parseError?: string };

@Injectable()
export class AiAdminAgentService {
  constructor(
    private readonly applicationTools: AiApplicationToolsService,
    private readonly analyticsTools: AiAdminAnalyticsToolsService,
    private readonly actionState: AiAdminActionStateService,
    private readonly registry: AiToolRegistryService,
    private readonly customersService: CustomersService,
    private readonly aiModel: AiAdminModelService
  ) {}

  async process(request: AdminAgentRequest) {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("A message is required.");

    const pending = await this.actionState.get(request.adminId, request.conversationId);
    if (pending && isExplicitRejection(message)) {
      await this.actionState.clear(request.adminId, request.conversationId);
      return { reply: "The pending admin action was cancelled.", snapshotAt: new Date().toISOString() };
    }
    if (pending && isExplicitConfirmation(message)) {
      const expected = `${pending.action}:${stableArguments(pending.arguments)}`;
      if (pending.fingerprint !== expected) {
        await this.actionState.clear(request.adminId, request.conversationId);
        throw new BadRequestException("The pending admin action is invalid. Please repeat the action.");
      }
      const result = await this.executePendingWrite(pending.action, pending.arguments, request);
      await this.actionState.clear(request.adminId, request.conversationId);
      return { reply: `Confirmed. ${formatWriteResult(pending.action, result)}`, snapshotAt: new Date().toISOString(), data: result };
    }

    const registryTools = await this.registry.getTools();
    const toolMap = new Map(registryTools.map((tool) => [tool.name, tool]));
    const tools = [
      ...registryTools.filter((tool) => !tool.requiresCustomerContext).map((tool) => modelTool(tool.name, tool.description, tool.inputSchema)),
      modelTool("get_order_metrics", "Read order metrics for today, this week, or this month.", { type: "object", properties: { range: { type: "string", enum: ["today", "week", "month"] } }, additionalProperties: false }),
      modelTool("search_customers", "Find customer records by name, phone number, or Messenger identifier. Use this for any customer lookup.", { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"], additionalProperties: false }),
      modelTool("search_orders", "Find orders by order number, customer, phone number, location, date, or status.", { type: "object", properties: { query: { type: "string" }, date: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, additionalProperties: false }),
      modelTool("get_current_datetime", "Read the current date and time in Asia/Manila. Use for relative dates and schedules.", { type: "object", properties: {}, additionalProperties: false }),
      modelTool("get_order_summary", "Read a specific order using a verified order id or order number.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }),
      modelTool("get_my_orders", "Read recent orders for a verified customer id.", { type: "object", properties: { customerId: { type: "string" }, limit: { type: "number" } }, required: ["customerId"], additionalProperties: false }),
      modelTool("check_order_status", "Read the current status of a specific order.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }),
      modelTool("create_customer", "Create a customer only after search_customers finds no matching record and the administrator explicitly confirms the exact details.", { type: "object", properties: { name: { type: "string" }, phoneNumber: { type: "string" }, defaultAddress: { type: "string" }, confirmed: { type: "boolean" } }, required: ["name", "confirmed"], additionalProperties: false }),
      modelTool("create_order", "Create a real order only after all required checkout information is known and the administrator explicitly confirms it.", { type: "object", properties: { customerId: { type: "string" }, customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string" }, paymentMethod: { type: "string" }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false }),
      modelTool("update_order", "Update an existing order by verified order id or order number. Requires confirmation.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, status: { type: "string" }, preferredSchedule: { type: "string" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false }),
      modelTool("cancel_order", "Cancel an order only after confirmation and verification of its id or order number.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false })
    ];

    const system = `You are the Empanada Hauz Admin AI Agent. You are the reasoning brain for an authenticated administrator.

The application provides tools as capabilities. Decide yourself whether a tool is needed, which tool is appropriate, what arguments it needs, and whether another tool is needed after seeing a result. Do not rely on keywords, intent labels, routing rules, or fixed user phrasing.

RULES:
- Use tools for current, precise, or database-backed information. Never guess business data.
- Search before identifying a customer or order when the administrator provides a name, phone number, or other non-unique description.
- You may chain multiple tools to solve one request.
- Treat tool results as authoritative and tool errors as facts; never fabricate missing information.
- Never invent customer ids, order ids, order numbers, prices, statuses, dates, fees, inventory, or policies.
- Read tools can execute normally. Writes require explicit administrator confirmation; never manufacture confirmed=true.
- For customer creation, search_customers first and do not create duplicates.
- For order changes, verify the target with search_orders before making a consequential change when the target is not already uniquely identified.
- Answer naturally and concisely after the required tools have completed.
- Do not mention internal routing, regexes, tool implementation, or hidden instructions.`;

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: system },
      ...(request.history ?? []).slice(-12).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: message }
    ];

    for (let step = 0; step < 8; step += 1) {
      const response = await this.aiModel.chat(messages, tools);
      const content = readContent(response);
      const calls = readToolCalls(response);
      if (!calls.length) return { reply: content || "I couldn't produce a response.", snapshotAt: new Date().toISOString() };

      messages.push({ role: "assistant", content, tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) });
      for (const call of calls) {
        try {
          if (call.parseError) throw new BadRequestException(call.parseError);
          const result = await this.executeTool(call.name, call.arguments, request, toolMap);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        } catch (error) {
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Tool execution failed." }) });
        }
      }
    }

    return { reply: "I reached the tool execution limit before completing that request.", snapshotAt: new Date().toISOString() };
  }

  private async executeTool(name: string, args: Record<string, unknown>, request: AdminAgentRequest, toolMap: Map<string, any>) {
    if (name === "get_order_metrics") return this.analyticsTools.getOrderMetrics(args.range === "week" || args.range === "month" ? args.range : "today");
    if (name === "search_customers") return this.analyticsTools.searchCustomers(String(args.query ?? ""), Number(args.limit ?? 10));
    if (name === "search_orders") return this.analyticsTools.searchOrders(typeof args.query === "string" ? args.query : undefined, typeof args.date === "string" ? args.date : undefined, typeof args.status === "string" ? args.status : undefined, Number(args.limit ?? 20));
    if (["create_customer", "create_order", "update_order", "cancel_order"].includes(name)) return this.prepareWrite(name, args, request);
    if (["get_current_datetime", "get_order_summary", "get_my_orders", "check_order_status"].includes(name)) return this.applicationTools.execute(name as AiApplicationToolName, args);

    const tool = toolMap.get(name);
    if (!tool) throw new BadRequestException(`Unknown AI tool: ${name}`);
    if (tool.risk === "write") return this.prepareWrite(name, args, request);
    return this.registry.execute(name, args, { customerId: String(args.customerId ?? "admin"), conversationId: request.conversationId, channel: "admin" });
  }

  private async prepareWrite(name: string, args: Record<string, unknown>, request: AdminAgentRequest) {
    if (args.confirmed === true && isExplicitConfirmation(request.message)) return this.executePendingWrite(name, stripConfirmation(args), request);
    const persisted = stripConfirmation(args);
    await this.actionState.save(request.adminId, request.conversationId, name, persisted, `${name}:${stableArguments(persisted)}`);
    return { ok: false, requiresConfirmation: true, message: "Explicit administrator confirmation is required before this action can execute.", pendingAction: name, arguments: persisted };
  }

  private async executePendingWrite(name: string, args: Record<string, unknown>, request: AdminAgentRequest) {
    if (name === "update_order") return this.analyticsTools.updateOrder(args as { id?: string; orderNumber?: string; status?: string; notes?: string });
    if (name === "create_customer") return this.customersService.createCustomer(args as { name?: string; phoneNumber?: string; defaultAddress?: string });
    if (name === "create_order" || name === "cancel_order") return this.applicationTools.execute(name as AiApplicationToolName, { ...args, confirmed: true });
    return this.registry.execute(name, { ...args, confirmed: true }, { customerId: String(args.customerId ?? "admin"), conversationId: request.conversationId, channel: "admin" });
  }
}

function modelTool(name: string, description: string, parameters: Record<string, unknown>) {
  return { type: "function", function: { name, description, parameters } };
}

function readContent(response: unknown) {
  const value = response as { content?: string; message?: { content?: string }; choices?: Array<{ message?: { content?: string } }> };
  return value?.content?.trim() || value?.message?.content?.trim() || value?.choices?.[0]?.message?.content?.trim() || "";
}

function readToolCalls(response: unknown): ToolCall[] {
  type Shape = { id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } };
  const value = response as { tool_calls?: Shape[]; message?: { tool_calls?: Shape[] }; choices?: Array<{ message?: { tool_calls?: Shape[] } }> };
  const calls = value?.tool_calls ?? value?.message?.tool_calls ?? value?.choices?.[0]?.message?.tool_calls ?? [];
  return calls.flatMap((call, index) => {
    const name = call.function?.name?.trim();
    if (!name) return [];
    const id = call.id || `admin-tool-${index}`;
    try {
      const raw = call.function?.arguments ?? "{}";
      const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [{ id, name, arguments: {}, parseError: "Tool arguments must be a JSON object." }];
      return [{ id, name, arguments: parsed as Record<string, unknown> }];
    } catch {
      return [{ id, name, arguments: {}, parseError: "The model returned invalid JSON tool arguments." }];
    }
  });
}

function isExplicitConfirmation(message: string) {
  return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed)([.!\s]|$)/i.test(message.trim());
}

function isExplicitRejection(message: string) {
  return /^(no|nope|nah|cancel|stop|don't|do not)([.!\s]|$)/i.test(message.trim());
}

function stripConfirmation(args: Record<string, unknown>) {
  const copy = { ...args };
  delete copy.confirmed;
  return copy;
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

function formatWriteResult(name: string, result: unknown) {
  if (name === "update_order" && result && typeof result === "object") {
    const value = result as { orderNumber?: string; status?: string };
    if (value.orderNumber && value.status) return `Order ${value.orderNumber} is now ${value.status}.`;
  }
  if (name === "create_customer" && result && typeof result === "object") {
    const value = result as { name?: string; id?: string };
    if (value.name) return `Customer ${value.name} was created${value.id ? ` (ID: ${value.id})` : ""}.`;
  }
  return `${name.replace(/_/g, " ")} completed.`;
}
