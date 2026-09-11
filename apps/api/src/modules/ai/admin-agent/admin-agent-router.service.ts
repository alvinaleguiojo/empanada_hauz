import { Injectable } from "@nestjs/common";
import { AdminRoute } from "./admin-agent.types";

@Injectable()
export class AdminAgentRouterService {
  route(message: string): AdminRoute {
    const value = message.trim();
    if (/^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed)([.!\s]|$)/i.test(value)) return { intent: "confirmation" };
    if (/^(no|nope|nah|cancel|stop|don't|do not)([.!\s]|$)/i.test(value)) return { intent: "confirmation" };

    const order = this.extractOrderSearch(value);
    if (order) return { intent: "order_lookup", query: order, toolNames: ["search_orders"] };

    const customer = this.extractCustomerSearch(value);
    if (customer) return { intent: "customer_lookup", query: customer, toolNames: ["search_customers"] };

    if (/\b(how many|count|number of|orders|sales|revenue|income|metrics|analytics|performance)\b/i.test(value) && /\b(today|this week|this month|week|month)\b/i.test(value)) {
      return { intent: "metrics", toolNames: ["get_order_metrics"] };
    }

    return { intent: "complex" };
  }

  private extractOrderSearch(message: string) {
    const patterns = [
      /^(?:find|search(?:\s+for)?|look\s+for)\s+(.+?)(?:['’]s)?\s+orders?\s*\??$/i,
      /^(?:find|search(?:\s+for)?|look\s+for)\s+orders?\s+(?:for\s+)?(.+?)\s*\??$/i,
    ];
    for (const pattern of patterns) {
      const query = message.match(pattern)?.[1]?.trim();
      if (query && !/^orders?\b/i.test(query)) return query;
    }
    return null;
  }

  private extractCustomerSearch(message: string) {
    const match = message.match(/^(?:find|search(?:\s+for)?|look\s+for)\s+(.+?)\s*\??$/i);
    if (!match) return null;
    const query = match[1].trim();
    if (!query || /^orders?\b/i.test(query) || /^customers?\b/i.test(query)) return null;
    return query;
  }
}
