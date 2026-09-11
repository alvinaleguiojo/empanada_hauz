import { BadRequestException, Injectable } from "@nestjs/common";
import { AiAdminAgentService } from "../ai-admin-agent.service";
import { AiAdminAnalyticsToolsService } from "../ai-admin-analytics-tools.service";
import { AdminAgentRouterService } from "./admin-agent-router.service";

interface AdminAgentRequest {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  adminId: string;
  conversationId: string;
}

@Injectable()
export class AdminAgentFacadeService {
  constructor(
    private readonly legacyAgent: AiAdminAgentService,
    private readonly router: AdminAgentRouterService,
    private readonly analytics: AiAdminAnalyticsToolsService
  ) {}

  async process(request: AdminAgentRequest) {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("A message is required.");

    const route = this.router.route(message);

    if (route.intent === "confirmation") {
      return this.legacyAgent.process(request);
    }

    if (route.intent === "order_lookup" && route.query) {
      const status = this.parseStatusQuery(route.query);
      const query = status ? undefined : route.query;
      const orders = await this.analytics.searchOrders(query, undefined, status ?? undefined, 20);
      return {
        reply: orders.length ? this.formatOrders(route.query, orders, status) : this.formatNoOrderMatch(route.query, status),
        snapshotAt: new Date().toISOString(),
        data: orders
      };
    }

    if (route.intent === "customer_lookup" && route.query) {
      const customers = await this.analytics.searchCustomers(route.query, 10);
      return {
        reply: customers.length ? this.formatCustomers(route.query, customers) : `No customer record found for "${route.query}".`,
        snapshotAt: new Date().toISOString(),
        data: customers
      };
    }

    if (route.intent === "metrics") {
      const range = /\bmonth\b/i.test(message) ? "month" : /\bweek\b/i.test(message) ? "week" : "today";
      const data = await this.analytics.getOrderMetrics(range);
      return { reply: this.formatMetrics(range, data), snapshotAt: new Date().toISOString(), data };
    }

    return this.legacyAgent.process(request);
  }

  private parseStatusQuery(query: string) {
    if (!query.startsWith("__status__:")) return null;
    const status = query.slice("__status__:".length);
    return status === "queued" || status === "awaiting_confirmation" || status === "completed" || status === "cancelled" ? status : null;
  }

  private formatNoOrderMatch(query: string, status: string | null) {
    return status ? `No ${status.replace(/_/g, " ")} orders found.` : `No order found for "${query}".`;
  }

  private formatOrders(query: string, orders: Array<{ orderNumber: string; status: string; quantity: number; totalAmount: unknown; customer?: { name: string; phoneNumber?: string | null } | null }>, status: string | null) {
    const title = status ? `${status.replace(/_/g, " ").replace(/^\w/, (value) => value.toUpperCase())} orders` : `Order matches for "${query}"`;
    const lines = orders.map((order, index) => `${index + 1}. ${order.orderNumber} — ${order.customer?.name ?? "Unknown customer"}${order.customer?.phoneNumber ? ` · ${order.customer.phoneNumber}` : ""} · ${order.status} · ${order.quantity} pcs · ₱${Number(order.totalAmount).toLocaleString("en-PH")}`);
    return `${title}:\n${lines.join("\n")}`;
  }

  private formatCustomers(query: string, customers: Array<{ name: string; phoneNumber?: string | null; totalOrders: number; totalSpent: unknown; isVip: boolean }>) {
    const lines = customers.map((customer, index) => `${index + 1}. ${customer.name}${customer.phoneNumber ? ` — ${customer.phoneNumber}` : ""} · ${customer.totalOrders} orders · ₱${Number(customer.totalSpent).toLocaleString("en-PH")}${customer.isVip ? " · VIP" : ""}`);
    return `Customer matches for "${query}":\n${lines.join("\n")}`;
  }

  private formatMetrics(range: string, data: unknown) {
    if (!data || typeof data !== "object") return `I couldn't retrieve ${range} order metrics right now.`;
    const value = data as Record<string, unknown>;
    const orders = typeof value.orders === "number" ? value.orders : typeof value.totalOrders === "number" ? value.totalOrders : undefined;
    const revenue = typeof value.revenue === "number" ? value.revenue : typeof value.totalRevenue === "number" ? value.totalRevenue : undefined;
    const parts = [`Order metrics for ${range}:`];
    if (orders !== undefined) parts.push(`Orders: ${orders}`);
    if (revenue !== undefined) parts.push(`Revenue: ₱${revenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
    if (parts.length === 1) parts.push(JSON.stringify(data));
    return parts.join("\n");
  }
}
