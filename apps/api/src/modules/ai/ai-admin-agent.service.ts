import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { ProductsService } from "../products/products.service";
import { AiApplicationToolsService, AiApplicationToolName } from "./ai-application-tools.service";
import { AiModelService } from "./ai-model.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";

interface AdminAgentRequest { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> }
interface AdminToolCall { name: string; arguments: Record<string, unknown> }

@Injectable()
export class AiAdminAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly applicationTools: AiApplicationToolsService,
    private readonly registry: AiToolRegistryService,
    private readonly aiModel: AiModelService
  ) {}

  async process(request: AdminAgentRequest) {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("A message is required.");

    const snapshot = await this.businessSnapshot();
    const registryTools = await this.registry.getTools();
    const tools = [
      ...registryTools.filter((tool) => !tool.requiresCustomerContext).map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
      })),
      ...this.applicationToolDefinitions()
    ];

    const system = `You are the private Empanada Hauz Admin AI Agent. You assist an authenticated administrator, not a customer. You have access to live business data and approved application tools. Be concise but operationally useful. Never invent business facts when a tool or snapshot can provide them.

You may analyze sales, orders, customers, products, inventory, production, expenses, deliveries, riders, referrals, analytics, conversations, and system activity from the supplied live snapshot. Use tools when the user asks for current or precise information or wants an action performed.

WRITE SAFETY: Reading is automatic. For destructive or consequential actions (create/update/cancel orders, changing products, inventory, expenses, users, delivery state, or other writes), explain what will happen and require the admin to explicitly confirm in the same request before executing. Never treat an implied request as confirmation. If a tool itself requires confirmation, pass confirmed=true only after explicit confirmation.

CUSTOMER OPERATIONS: When using customer-specific order tools, the customerId must come from the admin's request or live data; never guess an identity.

Business snapshot:\n${JSON.stringify(snapshot)}\n\nAvailable tools:\n${tools.map((tool) => `${tool.function.name}: ${tool.function.description}`).join("\n")}`;

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: system },
      ...(request.history ?? []).slice(-12).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: message }
    ];

    for (let step = 0; step < 6; step += 1) {
      const response = await this.aiModel.chatWithTools(messages, tools);
      const toolCalls = this.readToolCalls(response);
      const content = this.readContent(response);
      if (!toolCalls.length) return { reply: content || "I couldn't produce a response.", snapshotAt: new Date().toISOString() };

      if (content) messages.push({ role: "assistant", content, tool_calls: toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) });
      else messages.push({ role: "assistant", content: "", tool_calls: toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) });

      for (const call of toolCalls) {
        try {
          const result = await this.executeTool(call.name, call.arguments);
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
      ["get_current_datetime", "Get the current Manila date and time.", { type: "object", properties: {} }],
      ["get_order_summary", "Read an order by customerId and order number or id.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } } }],
      ["get_my_orders", "Read recent orders for a customer.", { type: "object", properties: { customerId: { type: "string" }, limit: { type: "number" } }, required: ["customerId"] }],
      ["check_order_status", "Read the current status of a customer's order.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" } } }],
      ["create_order", "Create an order. Requires confirmed=true and complete order data.", { type: "object", properties: { customerId: { type: "string" }, customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string" }, paymentMethod: { type: "string" }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"] }],
      ["update_order", "Update an existing order. Only do this after explicit admin confirmation.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, status: { type: "string" }, preferredSchedule: { type: "string" }, notes: { type: "string" }, confirmed: { type: "boolean" } } }],
      ["cancel_order", "Cancel a queued customer order after explicit confirmation.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } } }],
      ["delete_order", "Delete order is intentionally rejected by the application. Prefer cancellation.", { type: "object", properties: { customerId: { type: "string" }, orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } } }]
    ];
    return definitions.map(([name, description, parameters]) => ({ type: "function", function: { name, description, parameters } }));
  }

  private async executeTool(name: string, args: Record<string, unknown>) {
    const applicationNames = new Set<string>(["get_current_datetime", "get_order_summary", "get_my_orders", "check_order_status", "create_order", "update_order", "cancel_order", "delete_order"]);
    if (applicationNames.has(name)) {
      const write = ["create_order", "update_order", "cancel_order", "delete_order"].includes(name);
      if (write && args.confirmed !== true) throw new BadRequestException("Explicit admin confirmation is required before this write action.");
      return this.applicationTools.execute(name as AiApplicationToolName, args);
    }
    const tool = (await this.registry.getTools()).find((item) => item.name === name);
    if (!tool) throw new BadRequestException(`Unknown admin tool: ${name}`);
    if (tool.risk === "write" && args.confirmed !== true) throw new BadRequestException("Explicit admin confirmation is required before this write action.");
    return this.registry.execute(name, args, { customerId: "admin", channel: "admin" });
  }

  private readContent(response: unknown) {
    const value = response as { message?: { content?: string }; choices?: Array<{ message?: { content?: string } }> };
    return value?.message?.content?.trim() || value?.choices?.[0]?.message?.content?.trim() || "";
  }

  private readToolCalls(response: unknown): Array<AdminToolCall & { id: string }> {
    const value = response as { message?: { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } }> }; choices?: Array<{ message?: { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } }> }> };
    const calls = value?.message?.tool_calls ?? value?.choices?.[0]?.message?.tool_calls ?? [];
    return calls.flatMap((call, index) => {
      const name = call.function?.name?.trim();
      if (!name) return [];
      let args: Record<string, unknown> = {};
      try { args = typeof call.function?.arguments === "string" ? JSON.parse(call.function.arguments || "{}") : (call.function?.arguments ?? {}); } catch { args = {}; }
      return [{ id: call.id || `admin-tool-${index}`, name, arguments: args }];
    });
  }

  private async businessSnapshot() {
    const [products, customers, orders, inventory, batches, expenses, deliveries, riders, referrals, analytics, conversations] = await Promise.all([
      this.products.list({ availableOnly: false }),
      this.prisma.customer.findMany({ orderBy: { updatedAt: "desc" }, take: 500, select: { id: true, name: true, phoneNumber: true, totalOrders: true, totalSpent: true, isVip: true, preferredDeliveryMethod: true, lastOrderDate: true, createdAt: true } }),
      this.prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 500, select: { id: true, orderNumber: true, customerId: true, quantity: true, totalAmount: true, deliveryFee: true, status: true, deliveryMethod: true, paymentMethod: true, preferredSchedule: true, createdAt: true, updatedAt: true, items: true } }),
      this.prisma.inventoryItem.findMany({ orderBy: { displayName: "asc" } }),
      this.prisma.batch.findMany({ orderBy: { batchDate: "desc" }, take: 100 }),
      this.prisma.expense.findMany({ orderBy: { expenseDate: "desc" }, take: 300 }),
      this.prisma.delivery.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }),
      this.prisma.rider.findMany({ include: { user: { select: { id: true, name: true, email: true } }, vehicles: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
      this.prisma.referral.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
      this.prisma.analyticsSnapshot.findMany({ orderBy: { snapshotDate: "desc" }, take: 90 }),
      this.prisma.conversation.findMany({ orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, customerId: true, channel: true, status: true, lastMessage: true, updatedAt: true } })
    ]);

    return { generatedAt: new Date().toISOString(), products, customers, orders, inventory, batches, expenses, deliveries, riders, referrals, analytics, conversations };
  }
}
