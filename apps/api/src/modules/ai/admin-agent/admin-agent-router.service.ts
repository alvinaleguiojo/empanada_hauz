import { Injectable } from "@nestjs/common";
import { AdminRoute } from "./admin-agent.types";

@Injectable()
export class AdminAgentRouterService {
  route(message: string): AdminRoute {
    const value = message.trim();

    if (this.isConfirmation(value)) return { intent: "confirmation" };

    const orderNumber = this.extractOrderNumber(value);
    if (orderNumber) return { intent: "order_lookup", query: orderNumber, toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };

    const orderSearch = this.extractOrderSearch(value);
    if (orderSearch) return { intent: "order_lookup", query: orderSearch, toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };

    const customer = this.extractCustomerSearch(value);
    if (customer) return { intent: "customer_lookup", query: customer, toolNames: ["search_customers", "get_my_orders", "get_order_summary", "check_order_status"] };

    if (/\b(how many|count|number of|orders|sales|revenue|income|metrics|analytics|performance)\b/i.test(value) && /\b(today|this week|this month|week|month|yesterday)\b/i.test(value)) {
      return { intent: "metrics", toolNames: ["get_order_metrics", "search_orders"] };
    }

    if (/\b(cancel|reschedule|update|change|edit|mark)\b/i.test(value) && /\border\b/i.test(value)) {
      return { intent: "complex", toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };
    }

    if (/\b(customer|client|buyer)\b/i.test(value)) {
      return { intent: "complex", toolNames: ["search_customers", "get_my_orders", "get_order_summary", "check_order_status"] };
    }

    if (/\b(order|orders|delivery|status|pending|queued|completed|cancelled)\b/i.test(value)) {
      return { intent: "complex", toolNames: ["search_orders", "get_order_summary", "check_order_status"] };
    }

    if (/\b(sales|revenue|income|metrics|analytics|performance)\b/i.test(value)) {
      return { intent: "complex", toolNames: ["get_order_metrics", "search_orders"] };
    }

    return { intent: "complex" };
  }

  private isConfirmation(value: string) {
    return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed|no|nope|nah|cancel|stop|don't|do not)([.!\s]|$)/i.test(value);
  }

  private extractOrderNumber(message: string) {
    if (!/\border\b|^#/i.test(message)) return null;
    const match = message.match(/(?:order\s*#?\s*|#\s*)([0-9]{4,})\b/i);
    return match?.[1] ?? null;
  }

  private extractOrderSearch(message: string) {
    const patterns = [
      /^(?:find|search(?:\s+for)?|look\s+for)\s+(?:an?\s+)?orders?\s+(?:for\s+)?(.+?)\s*\??$/i,
      /^(?:find|search(?:\s+for)?|look\s+for)\s+(.+?)(?:['’]s)?\s+orders?\s*\??$/i,
    ];
    for (const pattern of patterns) {
      const query = message.match(pattern)?.[1]?.trim();
      if (query && !/^orders?\b/i.test(query)) return query;
    }
    return null;
  }

  private extractCustomerSearch(message: string) {
    const match = message.match(/^(?:find|search(?:\s+for)?|look\s+for)\s+(?:customer|client|buyer)\s+(.+?)\s*\??$/i)
      ?? message.match(/^(?:find|search(?:\s+for)?|look\s+for)\s+(.+?)\s*\??$/i);
    if (!match) return null;
    const query = match[1].trim();
    if (!query || /^(orders?|customers?|clients?|buyers?)\b/i.test(query)) return null;
    return query;
  }
}
