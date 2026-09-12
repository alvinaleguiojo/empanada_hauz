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
interface AdminToolCall { name: string; arguments: Record<string, unknown>; parseError?: string }

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

    const pendingConfirmation = await this.executeDirectConfirmation(message, request.adminId, request.conversationId);
    if (pendingConfirmation) return pendingConfirmation;

    const directOrderSearch = extractDirectOrderSearch(message);
    if (directOrderSearch) {
      const orders = await this.analyticsTools.searchOrders(directOrderSearch, undefined, undefined, 20);
      if (orders.length === 0) return { reply: `No order found for \"${directOrderSearch}\".`, snapshotAt: new Date().toISOString() };
      return { reply: formatOrderSearchReply(directOrderSearch, orders), snapshotAt: new Date().toISOString(), data: orders };
    }

    const directCustomerSearch = extractDirectCustomerSearch(message);
    if (directCustomerSearch) {
      const customers = await this.analyticsTools.searchCustomers(directCustomerSearch, 10);
      if (customers.length === 0) return { reply: `No customer record found for \"${directCustomerSearch}\".`, snapshotAt: new Date().toISOString() };
      return { reply: formatCustomerSearchReply(directCustomerSearch, customers), snapshotAt: new Date().toISOString(), data: customers };
    }

    const registryTools = await this.registry.getTools();
    const registryToolMap = new Map(registryTools.map((tool) => [tool.name, tool]));
    const tools = registryTools.filter((tool) => !tool.requiresCustomerContext && tool.name !== "get_current_datetime" && tool.name !== "delete_order").map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
    tools.push(...this.applicationToolDefinitions());
    tools.push(...this.adminReadToolDefinitions());
    tools.push(this.createCustomerToolDefinition());

    const system = `You are the private Empanada Hauz Admin AI Agent. You assist an authenticated administrator, not a customer.

You have access only to the tools supplied in this request. Use those tools as the authoritative source for current or precise business information.

GROUNDING RULES:
- Use only tools that actually appear in the tools list. Never invent, simulate, or describe a tool that is not supplied.
- Never invent business data, prices, statuses, customer identities, order details, dates, balances, fees, analytics, or inventory levels.
- Never invent or assume business policies, thresholds, deadlines, cancellation rules, refund rules, or authorization requirements.
- For current or precise information, call the relevant tool before answering.
- Never claim that records were found or that none were found unless a tool actually returned that result.
- If the available tools cannot retrieve the requested information, say so clearly.
- Never guess customerId, order id, or order number. Use an identifier explicitly provided by the administrator or returned by a search tool.

CUSTOMER CREATION:
- When an administrator asks to create a new customer, first use search_customers with the provided name and/or phone number.
- Only use create_customer after the search shows that no matching customer exists.
- Before creating, present the exact customer details that will be stored and ask for explicit confirmation.
- Never use create_customer with confirmed=true unless the administrator has explicitly confirmed the exact pending creation.
- If a phone number already belongs to a customer, do not create a duplicate; use the existing customer record.

WRITE SAFETY:
- Read actions may execute normally.
- Consequential or destructive actions require explicit administrator confirmation.
- A confirmation may be a follow-up message in the same admin conversation when there is a matching pending action.
- Never manufacture confirmed=true.
- Never treat an implied request as confirmation.
- Execute a confirmed write only once.
- After a write, report the actual application result; do not invent success.

TOOL USE:
- Prefer the narrowest relevant tool.
- Use search_customers before customer-specific order tools when the administrator gives a customer name or phone instead of an internal customerId.
- Use search_orders for order lookup.
- For administrator order changes, use update_order with the verified order id or order number; do not require customerId.
- Use multiple tools when a request requires multiple verified facts.
- Treat tool errors as facts about what the application could not do, not as permission to guess.
- Keep the final response concise and operationally useful.`;

    const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }, ...(request.history ?? []).slice(-12).map((item) => ({ role: item.role, content: item.content })), { role: "user", content: message }];
    const executedWrites = new Set<string>();

    for (let step = 0; step < 6; step += 1) {
      const response = await this.aiModel.chat(messages, tools);
      const toolCalls = this.readToolCalls(response);
      const content = this.readContent(response);
      if (!toolCalls.length) return { reply: content || "I couldn't produce a response.", snapshotAt: new Date().toISOString() };

      messages.push({ role: "assistant", content: content || "", tool_calls: toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) });
      for (const call of toolCalls) {
        try {
          if (call.parseError) throw new BadRequestException(call.parseError);
          const result = await this.executeTool(call.name, call.arguments, message, request.adminId, request.conversationId, registryToolMap, executedWrites);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Tool execution failed.";
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: errorMessage }) });
        }
      }
    }
    return { reply: "I reached the tool execution limit before completing that request. Please narrow the request and try again.", snapshotAt: new Date().toISOString() };
  }

  private async executeDirectConfirmation(message: string, adminId: string, conversationId: string) {
    if (isExplicitRejection(message)) {
      const pending = await this.actionState.get(adminId, conversationId);
      if (!pending) return null;
      await this.actionState.clear(adminId, conversationId);
      return { reply: `Cancelled the pending ${formatPendingAction(pending.action)}.`, snapshotAt: new Date().toISOString() };
    }

    if (!isExplicitConfirmation(message)) return null;
    const pending = await this.actionState.get(adminId, conversationId);
    if (!pending) return null;

    const expectedFingerprint = `${pending.action}:${stableArguments(pending.arguments)}`;
    if (pending.fingerprint !== expectedFingerprint) {
      await this.actionState.clear(adminId, conversationId);
      throw new BadRequestException("The pending admin action is invalid. Please repeat the action.");
    }

    const result = await executePendingWrite(pending.action, pending.arguments, this.applicationTools, this.analyticsTools, this.registry, this.customersService);
    await this.actionState.clear(adminId, conversationId);
    return {
      reply: formatConfirmedWriteReply(pending.action, result),
      snapshotAt: new Date().toISOString(),
      data: result
    };
  }

  private applicationToolDefinitions() {
    const definitions: Array<[AiApplicationToolName, string, Record<string, unknown>]> = [
      ["get_current_datetime", "Get the current Manila date and time.", { type: "object", properties: {}, additionalProperties: false }],
      ["get_order_summary", "Read an order by customerId and order number or id.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }],
      ["get_my_orders", "Read recent orders for a customer.", { type: "object", properties: { customerId: { type: "string" }, limit: { type: "number" } }, required: ["customerId"], additionalProperties: false }],
      ["check_order_status", "Read the current status of a customer's order.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }],
      ["create_order", "Create an order. Requires confirmation.", { type: "object", properties: { customerId: { type: "string" }, customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string" }, paymentMethod: { type: "string" }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false }],
      ["update_order", "Administrator: update an existing order by id or order number. Requires confirmation. customerId is not required.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, status: { type: "string" }, preferredSchedule: { type: "string" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false }],
      ["cancel_order", "Cancel a queued customer order only after confirmation.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false }]
    ];
    return definitions.map(([name, description, parameters]) => ({ type: "function", function: { name, description, parameters } }));
  }

  private adminReadToolDefinitions() {
    return [
      { type: "function", function: { name: "get_order_metrics", description: "Count and summarize orders for today, this week, or this month.", parameters: { type: "object", properties: { range: { type: "string", enum: ["today", "week", "month"] } }, additionalProperties: false } } },
      { type: "function", function: { name: "search_customers", description: "Find administrator customer records by name, phone number, or Messenger identifier.", parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"], additionalProperties: false } } },
      { type: "function", function: { name: "search_orders", description: "Find orders by order number, customer name, phone number, location, date, or status.", parameters: { type: "object", properties: { query: { type: "string" }, date: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, additionalProperties: false } } }
    ];
  }

  private createCustomerToolDefinition() {
    return { type: "function", function: { name: "create_customer", description: "Create a new customer record only after no existing customer matches and the administrator explicitly confirms the exact details.", parameters: { type: "object", properties: { name: { type: "string" }, phoneNumber: { type: "string" }, defaultAddress: { type: "string" }, confirmed: { type: "boolean" } }, required: ["name", "confirmed"], additionalProperties: false } } };
  }

  private async executeTool(name: string, args: Record<string, unknown>, currentMessage: string, adminId: string, conversationId: string, registryToolMap: Map<string, any>, executedWrites: Set<string>) {
    if (name === "get_order_metrics") {
      const range = args.range === "week" || args.range === "month" ? args.range : "today";
      return this.analyticsTools.getOrderMetrics(range);
    }
    if (name === "search_customers") return this.analyticsTools.searchCustomers(String(args.query ?? ""), Number(args.limit ?? 10));
    if (name === "search_orders") return this.analyticsTools.searchOrders(typeof args.query === "string" ? args.query : undefined, typeof args.date === "string" ? args.date : undefined, typeof args.status === "string" ? args.status : undefined, Number(args.limit ?? 20));
    if (name === "create_customer") return this.executeConfirmedWrite(name, args, currentMessage, adminId, conversationId, executedWrites);

    const applicationNames = new Set<string>(["get_current_datetime", "get_order_summary", "get_my_orders", "create_order", "cancel_order"]);
    if (name === "update_order") return this.executeConfirmedWrite(name, args, currentMessage, adminId, conversationId, executedWrites);
    if (applicationNames.has(name)) {
      const write = ["create_order", "cancel_order"].includes(name);
      if (write) return this.executeConfirmedWrite(name, args, currentMessage, adminId, conversationId, executedWrites);
      return this.applicationTools.execute(name as AiApplicationToolName, args);
    }

    const tool = registryToolMap.get(name);
    if (!tool) throw new BadRequestException(`Unknown admin tool: ${name}`);
    if (tool.risk === "write") return this.executeConfirmedWrite(name, args, currentMessage, adminId, conversationId, executedWrites);
    return this.registry.execute(name, args, { customerId: "admin", channel: "admin" });
  }

  private async executeConfirmedWrite(name: string, args: Record<string, unknown>, currentMessage: string, adminId: string, conversationId: string, executedWrites: Set<string>) {
    const persistedArgs = stripConfirmation(args);
    const fingerprint = `${name}:${stableArguments(persistedArgs)}`;
    const explicit = isExplicitConfirmation(currentMessage);
    const pending = await this.actionState.get(adminId, conversationId);

    if (!explicit) {
      await this.actionState.save(adminId, conversationId, name, persistedArgs, fingerprint);
      throw new BadRequestException("This action requires confirmation. Ask the administrator to confirm this exact action before executing it.");
    }

    if (!pending || pending.action !== name) throw new BadRequestException("No matching pending admin action is available for this confirmation. Please repeat the requested action and then confirm it.");
    if (pending.fingerprint !== `${name}:${stableArguments(pending.arguments)}`) {
      await this.actionState.clear(adminId, conversationId);
      throw new BadRequestException("The pending admin action is invalid. Please repeat the action.");
    }

    const executionFingerprint = `${name}:${stableArguments(pending.arguments)}`;
    if (executedWrites.has(executionFingerprint)) return { ok: true, deduplicated: true, message: "This write action was already executed during the current request." };
    executedWrites.add(executionFingerprint);

    const result = await executePendingWrite(name, pending.arguments, this.applicationTools, this.analyticsTools, this.registry, this.customersService);
    await this.actionState.clear(adminId, conversationId);
    return result;
  }

  private readContent(response: unknown) {
    const value = response as { content?: string; message?: { content?: string }; choices?: Array<{ message?: { content?: string } }> };
    return value?.content?.trim() || value?.message?.content?.trim() || value?.choices?.[0]?.message?.content?.trim() || "";
  }

  private readToolCalls(response: unknown): Array<AdminToolCall & { id: string }> {
    type ToolCallShape = { id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } };
    type ResponseShape = { tool_calls?: ToolCallShape[]; message?: { tool_calls?: ToolCallShape[] }; choices?: Array<{ message?: { tool_calls?: ToolCallShape[] } }> };
    const value = response as ResponseShape;
    const calls = value?.tool_calls ?? value?.message?.tool_calls ?? value?.choices?.[0]?.message?.tool_calls ?? [];
    return calls.flatMap((call, index) => {
      const name = call.function?.name?.trim(); if (!name) return [];
      const id = call.id || `admin-tool-${index}`;
      if (call.function?.arguments && typeof call.function.arguments !== "string") return [{ id, name, arguments: call.function.arguments }];
      try {
        const rawArguments = call.function?.arguments ?? "{}";
        const parsed = typeof rawArguments === "string" ? JSON.parse(rawArguments || "{}") : rawArguments;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [{ id, name, arguments: {}, parseError: "Tool arguments must be a JSON object." }];
        return [{ id, name, arguments: parsed as Record<string, unknown> }];
      } catch { return [{ id, name, arguments: {}, parseError: "The model returned invalid JSON tool arguments." }]; }
    });
  }
}

async function executePendingWrite(name: string, pendingArgs: Record<string, unknown>, applicationTools: AiApplicationToolsService, analyticsTools: AiAdminAnalyticsToolsService, registry: AiToolRegistryService, customersService: CustomersService) {
  const args = { ...pendingArgs, confirmed: true };
  if (name === "update_order") return analyticsTools.updateOrder(pendingArgs);
  if (name === "create_customer") return customersService.createCustomer(pendingArgs as { name?: string; phoneNumber?: string; defaultAddress?: string });
  const applicationNames = new Set(["create_order", "cancel_order"]);
  if (applicationNames.has(name)) return applicationTools.execute(name as AiApplicationToolName, args);
  return registry.execute(name, args, { customerId: "admin", channel: "admin" });
}

function formatConfirmedWriteReply(name: string, result: unknown) {
  if (name === "update_order" && result && typeof result === "object") {
    const order = result as { orderNumber?: string; status?: string };
    if (order.orderNumber && order.status) return `Order ${order.orderNumber} successfully updated to \"${order.status}\".`;
  }
  if (name === "create_customer" && result && typeof result === "object") {
    const customer = result as { id?: string; name?: string; phoneNumber?: string | null };
    if (customer.id && customer.name) return `Customer ${customer.name} was created successfully${customer.phoneNumber ? ` (${customer.phoneNumber})` : ""}. Customer ID: ${customer.id}.`;
  }
  return `${formatPendingAction(name)} successfully executed.`;
}

function formatPendingAction(name: string) {
  if (name === "update_order") return "order update";
  if (name === "create_order") return "order creation";
  if (name === "cancel_order") return "order cancellation";
  if (name === "create_customer") return "customer creation";
  return name.replace(/_/g, " ");
}

function extractDirectOrderSearch(message: string) {
  const match = message.match(/^(?:find|search(?:\s+for)?|look\s+for)\s+(.+?)(?:['’]s)?\s+orders?\s*\??$/i);
  if (match) {
    const query = match[1].trim();
    if (query && !/^orders?\b/i.test(query)) return query;
  }

  const alternate = message.match(/^(?:find|search(?:\s+for)?|look\s+for)\s+orders?\s+(?:for\s+)?(.+?)\s*\??$/i);
  const query = alternate?.[1]?.trim();
  return query || null;
}

function formatOrderSearchReply(query: string, orders: Array<{ orderNumber: string; status: string; quantity: number; totalAmount: unknown; customer?: { name: string; phoneNumber?: string | null } | null }>) {
  const lines = orders.map((order, index) => `${index + 1}. ${order.orderNumber} — ${order.customer?.name ?? "Unknown customer"}${order.customer?.phoneNumber ? ` · ${order.customer.phoneNumber}` : ""} · ${order.status} · ${order.quantity} pcs · ₱${Number(order.totalAmount).toLocaleString("en-PH")}`);
  return `Order matches for \"${query}\":\n${lines.join("\n")}`;
}

function extractDirectCustomerSearch(message: string) {
  const match = message.match(/^(?:find|search(?:\s+for)?|look\s+for)\s+(.+?)\s*\??$/i);
  if (!match) return null;
  const query = match[1].trim();
  if (!query || /^orders?\b/i.test(query) || /^customers?\b/i.test(query)) return null;
  return query;
}

function formatCustomerSearchReply(query: string, customers: Array<{ name: string; phoneNumber?: string | null; totalOrders: number; totalSpent: unknown; isVip: boolean }>) {
  const lines = customers.map((customer, index) => `${index + 1}. ${customer.name}${customer.phoneNumber ? ` — ${customer.phoneNumber}` : ""} · ${customer.totalOrders} orders · ₱${Number(customer.totalSpent).toLocaleString("en-PH")} spent${customer.isVip ? " · VIP" : ""}`);
  return `Customer matches for \"${query}\":\n${lines.join("\n")}`;
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
