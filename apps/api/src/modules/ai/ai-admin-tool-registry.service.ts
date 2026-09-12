import { BadRequestException, Injectable } from "@nestjs/common";
import { AiApplicationToolName, AiApplicationToolsService } from "./ai-application-tools.service";
import { AiAdminAnalyticsToolsService } from "./ai-admin-analytics-tools.service";
import { AiAdminActionStateService } from "./ai-admin-action-state.service";
import { AiToolDefinition } from "./ai-tool.types";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { CustomersService } from "../customers/customers.service";
import { ExpensesService } from "../expenses/expenses.service";

export interface AdminToolContext { adminId: string; conversationId: string; message: string; }

const ADMIN_OWNED_TOOLS = new Set(["capture_order_draft", "clear_order_draft", "create_order", "update_order", "cancel_order", "create_customer", "get_order_metrics", "search_customers", "search_orders", "get_expenses", "get_expense_summary"]);

@Injectable()
export class AiAdminToolRegistryService {
  constructor(
    private readonly applicationTools: AiApplicationToolsService,
    private readonly analyticsTools: AiAdminAnalyticsToolsService,
    private readonly actionState: AiAdminActionStateService,
    private readonly registry: AiToolRegistryService,
    private readonly customersService: CustomersService,
    private readonly expensesService: ExpensesService
  ) {}

  async getTools(): Promise<AiToolDefinition[]> {
    const generic = await this.registry.getTools();
    const genericTools = generic.filter((tool) => !ADMIN_OWNED_TOOLS.has(tool.name));
    return [
      ...genericTools,
      { name: "get_order_metrics", description: "Read order metrics for today, this week, or this month.", risk: "read", inputSchema: { type: "object", properties: { range: { type: "string", enum: ["today", "week", "month"] } }, additionalProperties: false } },
      { name: "get_expenses", description: "Read the business expense ledger for a requested date range. Returns individual expenses, the range total, today's total, month-to-date total, and totals grouped by category. Use this whenever the administrator asks to review, list, inspect, or analyze recorded business expenses.", risk: "read", inputSchema: { type: "object", properties: { startDate: { type: "string", description: "Inclusive date in YYYY-MM-DD format. If omitted, defaults to today." }, endDate: { type: "string", description: "Inclusive date in YYYY-MM-DD format. If omitted, defaults to startDate." } }, additionalProperties: false } },
      { name: "get_expense_summary", description: "Read an aggregated business expense summary for a requested date range without returning every ledger row. Returns total spend, transaction count, and totals by category. Use this for questions about total spending, category breakdowns, biggest expense categories, or comparing spending periods.", risk: "read", inputSchema: { type: "object", properties: { startDate: { type: "string", description: "Inclusive date in YYYY-MM-DD format. If omitted, defaults to today." }, endDate: { type: "string", description: "Inclusive date in YYYY-MM-DD format. If omitted, defaults to startDate." } }, additionalProperties: false } },
      { name: "search_customers", description: "Find customer records by name, phone number, or Messenger identifier. Use this for customer identification before using a customer id.", risk: "read", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"], additionalProperties: false } },
      { name: "search_orders", description: "Find orders by order number, customer, phone number, location, date, or status.", risk: "read", inputSchema: { type: "object", properties: { query: { type: "string" }, date: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, required: [], additionalProperties: false } },
      { name: "create_customer", description: "Create a customer after search_customers finds no matching record and the administrator explicitly confirms the exact details.", risk: "write", requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { name: { type: "string" }, phoneNumber: { type: "string" }, defaultAddress: { type: "string" }, confirmed: { type: "boolean" } }, required: ["name", "confirmed"], additionalProperties: false } },
      { name: "create_order", description: "Create a real order after all required checkout information is known and the administrator explicitly confirms it.", risk: "write", requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { customerId: { type: "string" }, customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string" }, paymentMethod: { type: "string" }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false } },
      { name: "update_order", description: "Update an existing order by a verified order id or order number. Use preferredSchedule to reschedule an order. Requires administrator confirmation. Do not use customerId as the order identifier.", risk: "write", requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string", description: "Public order number such as EMP-1789200044139." }, id: { type: "string", description: "Internal Mongo order id when available." }, status: { type: "string" }, notes: { type: "string" }, preferredSchedule: { type: "string", description: "New scheduled date/time as an ISO-8601 datetime with timezone offset." }, confirmed: { type: "boolean" } }, additionalProperties: false } },
      { name: "cancel_order", description: "Cancel an order only after confirmation and verification of its id or order number.", risk: "write", requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false } }
    ];
  }

  async execute(name: string, args: Record<string, unknown>, context: AdminToolContext) {
    if (name === "get_order_metrics") return this.analyticsTools.getOrderMetrics(args.range === "week" || args.range === "month" ? args.range : "today");
    if (name === "get_expenses") return this.expensesService.list({ startDate: optionalString(args.startDate), endDate: optionalString(args.endDate) });
    if (name === "get_expense_summary") return this.expensesService.summary({ startDate: optionalString(args.startDate), endDate: optionalString(args.endDate) });
    if (name === "search_customers") return this.analyticsTools.searchCustomers(String(args.query ?? ""), Number(args.limit ?? 10));
    if (name === "search_orders") return this.analyticsTools.searchOrders(typeof args.query === "string" ? args.query : undefined, typeof args.date === "string" ? args.date : undefined, typeof args.status === "string" ? args.status : undefined, Number(args.limit ?? 20));

    const definitions = await this.getTools();
    const definition = definitions.find((tool) => tool.name === name);
    if (!definition) throw new BadRequestException(`Unknown AI tool: ${name}`);
    if (definition.risk === "write") return this.prepareWrite(name, args, context);
    if (["get_current_datetime", "get_order_summary", "get_my_orders", "check_order_status"].includes(name)) return this.applicationTools.execute(name as AiApplicationToolName, args);

    return this.registry.execute(name, args, { customerId: String(args.customerId ?? "admin"), conversationId: context.conversationId, channel: "admin" });
  }

  async confirmPending(context: AdminToolContext, action: string, args: Record<string, unknown>) {
    const expected = `${action}:${stableArguments(args)}`;
    const pending = await this.actionState.get(context.adminId, context.conversationId);
    if (!pending || pending.action !== action || pending.fingerprint !== expected) throw new BadRequestException("The pending admin action is invalid. Please repeat the action.");

    let result: unknown;
    switch (action) {
      case "create_customer": result = await this.customersService.createCustomer(args as { name?: string; phoneNumber?: string; defaultAddress?: string }); break;
      case "update_order": result = await this.analyticsTools.updateOrder(args as { id?: string; orderNumber?: string; status?: string; notes?: string; preferredSchedule?: string }); break;
      case "create_order":
      case "cancel_order": result = await this.applicationTools.execute(action as AiApplicationToolName, { ...args, confirmed: true }); break;
      default: result = await this.registry.execute(action, { ...args, confirmed: true }, { customerId: String(args.customerId ?? "admin"), conversationId: context.conversationId, channel: "admin" });
    }
    await this.actionState.clear(context.adminId, context.conversationId);
    return result;
  }

  private async prepareWrite(name: string, args: Record<string, unknown>, context: AdminToolContext) {
    if (args.confirmed === true && isExplicitConfirmation(context.message)) return this.confirmPendingDirect(name, stripConfirmation(args), context);
    const persisted = stripConfirmation(args);
    await this.actionState.save(context.adminId, context.conversationId, name, persisted, `${name}:${stableArguments(persisted)}`);
    return { ok: false, requiresConfirmation: true, message: "Explicit administrator confirmation is required before this action can execute.", pendingAction: name, arguments: persisted };
  }

  private async confirmPendingDirect(name: string, args: Record<string, unknown>, context: AdminToolContext) {
    switch (name) {
      case "create_customer": return this.customersService.createCustomer(args as { name?: string; phoneNumber?: string; defaultAddress?: string });
      case "update_order": return this.analyticsTools.updateOrder(args as { id?: string; orderNumber?: string; status?: string; notes?: string; preferredSchedule?: string });
      case "create_order":
      case "cancel_order": return this.applicationTools.execute(name as AiApplicationToolName, { ...args, confirmed: true });
      default: return this.registry.execute(name, { ...args, confirmed: true }, { customerId: String(args.customerId ?? "admin"), conversationId: context.conversationId, channel: "admin" });
    }
  }
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isExplicitConfirmation(message: string) { return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed)([.!\s]|$)/i.test(message.trim()); }
function stripConfirmation(args: Record<string, unknown>) { const copy = { ...args }; delete copy.confirmed; return copy; }
function stableArguments(args: Record<string, unknown>) { return JSON.stringify(sortObject(args)); }
function sortObject(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortObject); if (!value || typeof value !== "object") return value; return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => { result[key] = sortObject((value as Record<string, unknown>)[key]); return result; }, {}); }
