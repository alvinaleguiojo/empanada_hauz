import { BadRequestException, Injectable } from "@nestjs/common";
import { AiAdminAgentService } from "../ai-admin-agent.service";
import { AiAdminAnalyticsToolsService } from "../ai-admin-analytics-tools.service";
import { ProductsService } from "../../products/products.service";
import { AiDateTimeService } from "../ai-datetime.service";
import { AdminAgentRouterService } from "./admin-agent-router.service";

interface AdminAgentRequest {
  message: string;
  history?: Array<{ role: "user"; content: string } | { role: "assistant"; content: string }>;
  adminId: string;
  conversationId: string;
}

@Injectable()
export class AdminAgentFacadeService {
  constructor(
    private readonly legacyAgent: AiAdminAgentService,
    private readonly router: AdminAgentRouterService,
    private readonly analytics: AiAdminAnalyticsToolsService,
    private readonly products: ProductsService,
    private readonly dateTime: AiDateTimeService
  ) {}

  async process(request: AdminAgentRequest) {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("A message is required.");

    const route = this.router.route(message);

    // Resolve an exact database-backed product before conversational fallbacks.
    // This makes follow-ups such as "mango please" deterministic without putting
    // product names or prices in the router.
    if (this.isShortProductCandidate(message)) {
      const product = await this.products.resolveByName(message, { requireAvailable: false });
      if (product) return this.formatProduct(product);
    }

    if (route.intent === "smalltalk" && route.reply) return { reply: route.reply, snapshotAt: new Date().toISOString() };
    if (route.intent === "confirmation") return this.legacyAgent.process(request);

    // Quantity + product phrases are order intent, not product lookup. Let the
    // existing order agent handle customer context, delivery details and confirmation.
    if (route.intent === "product_lookup" && route.query && this.isQuantityOrderRequest(route.query)) {
      return this.legacyAgent.process(request);
    }

    if (route.intent === "order_lookup" && route.query) {
      const status = this.parseStatusQuery(route.query);
      const query = status ? undefined : route.query;
      const orders = await this.analytics.searchOrders(query, undefined, status ?? undefined, 20);
      return { reply: orders.length ? this.formatOrders(route.query, orders, status) : this.formatNoOrderMatch(route.query, status), snapshotAt: new Date().toISOString(), data: orders };
    }

    if (route.intent === "customer_lookup" && route.query) {
      const customers = await this.analytics.searchCustomers(route.query, 10);
      return { reply: customers.length ? this.formatCustomers(route.query, customers) : `No customer record found for "${route.query}".`, snapshotAt: new Date().toISOString(), data: customers };
    }

    if (route.intent === "datetime") {
      const current = this.dateTime.now();
      return { reply: `Current date and time: ${current.date} ${current.time} (${current.timezone}).`, snapshotAt: new Date().toISOString(), data: current };
    }

    if (route.intent === "product_lookup") {
      return this.resolveProductRequest(route.query);
    }

    if (route.intent === "product_price") {
      return this.resolveProductPrice(route.query);
    }

    if (route.intent === "metrics") {
      const range = /\bmonth\b/i.test(message) ? "month" : /\bweek\b/i.test(message) ? "week" : "today";
      const data = await this.analytics.getOrderMetrics(range);
      return { reply: this.formatMetrics(range, data), snapshotAt: new Date().toISOString(), data };
    }

    return this.legacyAgent.process(request);
  }

  private isShortProductCandidate(message: string) {
    const normalized = message.replace(/[?!.]+$/g, "").replace(/\s+/g, " ").trim();
    const words = normalized.split(" ");
    return words.length >= 1 && words.length <= 6 && normalized.length <= 80 && !/\b(order|orders|customer|customers|price|cost|pila|presyo|magkano|menu|menus|sales|revenue)\b/i.test(normalized);
  }

  private isQuantityOrderRequest(value: string) {
    return /\b\d+\s*(?:pcs?|pieces?)\b/i.test(value) || /\b(?:pcs?|pieces?)\s*\d+\b/i.test(value);
  }

  private async resolveProductRequest(query?: string) {
    if (query) {
      const normalized = query.replace(/[?!.]+$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (/^(all|tanan|everything|all items|all products)$/.test(normalized)) {
        const products = await this.products.list({ availableOnly: true });
        return { reply: this.formatProducts(products), snapshotAt: new Date().toISOString(), data: products };
      }

      const product = await this.products.resolveByName(query, { requireAvailable: false });
      if (!product) return { reply: `I couldn't find a product matching "${query}".`, snapshotAt: new Date().toISOString() };
      return this.formatProduct(product);
    }

    const products = await this.products.list({ availableOnly: true });
    return { reply: this.formatProducts(products), snapshotAt: new Date().toISOString(), data: products };
  }

  private async resolveProductPrice(query?: string) {
    if (!query) {
      return {
        reply: "Sure — which empanada would you like the price for?",
        snapshotAt: new Date().toISOString()
      };
    }

    const product = await this.products.resolveByName(query, { requireAvailable: false });
    if (!product) {
      return {
        reply: `I couldn't find a product matching "${query}". Try the menu or give me the product name.`,
        snapshotAt: new Date().toISOString()
      };
    }

    return {
      reply: `${product.name} — ₱${Number(product.price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}${product.available ? " — available" : " — currently unavailable"}`,
      snapshotAt: new Date().toISOString(),
      data: product
    };
  }

  private formatProduct(product: { name: string; price: number; available: boolean; description?: string | null }) {
    return {
      reply: `${product.name} — ₱${Number(product.price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}${product.available ? " — available" : " — currently unavailable"}${product.description ? ` — ${product.description}` : ""}`,
      snapshotAt: new Date().toISOString(),
      data: product
    };
  }

  private parseStatusQuery(query: string) {
    if (!query.startsWith("__status__:")) return null;
    const status = query.slice("__status__:".length);
    return status === "queued" || status === "awaiting_confirmation" || status === "completed" || status === "cancelled" ? status : null;
  }

  private formatNoOrderMatch(query: string, status: string | null) { return status ? `No ${status.replace(/_/g, " ")} orders found.` : `No order found for "${query}".`; }

  private formatOrders(query: string, orders: Array<{ orderNumber: string; status: string; quantity: number; totalAmount: unknown; customer?: { name: string; phoneNumber?: string | null } | null }>, status: string | null) {
    const title = status ? `${status.replace(/_/g, " ").replace(/^\w/, (value) => value.toUpperCase())} orders` : `Order matches for "${query}"`;
    const lines = orders.map((order, index) => `${index + 1}. ${order.orderNumber} — ${order.customer?.name ?? "Unknown customer"}${order.customer?.phoneNumber ? ` · ${order.customer.phoneNumber}` : ""} · ${order.status} · ${order.quantity} pcs · ₱${Number(order.totalAmount).toLocaleString("en-PH")}`);
    return `${title}:\n${lines.join("\n")}`;
  }

  private formatCustomers(query: string, customers: Array<{ name: string; phoneNumber?: string | null; totalOrders: number; totalSpent: unknown; isVip: boolean }>) {
    const lines = customers.map((customer, index) => `${index + 1}. ${customer.name}${customer.phoneNumber ? ` — ${customer.phoneNumber}` : ""} · ${customer.totalOrders} orders · ₱${Number(customer.totalSpent).toLocaleString("en-PH")}${customer.isVip ? " · VIP" : ""}`);
    return `Customer matches for "${query}":\n${lines.join("\n")}`;
  }

  private formatProducts(products: Array<{ name: string; description?: string | null; category?: string | null; price: number; available: boolean }>) {
    if (!products.length) return "No products are currently available.";

    const groups = new Map<string, typeof products>();
    for (const product of products) {
      const category = product.category?.trim() || "empanada";
      const existing = groups.get(category) ?? [];
      existing.push(product);
      groups.set(category, existing);
    }

    const sections: string[] = ["🥟 Empanada Hauz Price List"];
    for (const [category, items] of groups) {
      const title = category.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      sections.push(`\n${title}`);
      sections.push(items.map((product) => `• ${product.name} — ₱${Number(product.price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`).join("\n"));
    }

    sections.push("\nPrices shown are for currently available products.");
    return sections.join("\n");
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
