import { Injectable } from "@nestjs/common";
import { AdminRoute } from "./admin-agent.types";

@Injectable()
export class AdminAgentRouterService {
  route(message: string): AdminRoute {
    const value = message.trim();

    if (this.isConfirmation(value)) return { intent: "confirmation" };

    const operationalStatus = this.extractOperationalOrderStatus(value);
    if (operationalStatus) {
      return { intent: "order_lookup", query: `__status__:${operationalStatus}`, toolNames: ["search_orders", "get_order_summary", "check_order_status"] };
    }

    const orderNumber = this.extractOrderNumber(value);
    if (orderNumber) return { intent: "order_lookup", query: orderNumber, toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };

    const orderSearch = this.extractOrderSearch(value);
    if (orderSearch) return { intent: "order_lookup", query: orderSearch, toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };

    const customer = this.extractCustomerSearch(value);
    if (customer) return { intent: "customer_lookup", query: customer, toolNames: ["search_customers", "get_my_orders", "get_order_summary", "check_order_status"] };

    const smalltalk = this.routeSmalltalk(value);
    if (smalltalk) return smalltalk;

    if (/\b(how many|count|number of|orders|sales|revenue|income|metrics|analytics|performance)\b/i.test(value) && /\b(today|this week|this month|week|month)\b/i.test(value)) {
      return { intent: "metrics", toolNames: ["get_order_metrics", "search_orders"] };
    }

    if (/\b(cancel|reschedule|update|change|edit|mark)\b/i.test(value) && /\border\b/i.test(value)) {
      return { intent: "complex", toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };
    }

    if (/\b(customer|client|buyer)\b/i.test(value)) {
      return { intent: "complex", toolNames: ["search_customers", "get_my_orders", "get_order_summary", "check_order_status"] };
    }

    if (/\b(order|orders|delivery|status|pending|queued|completed|cancelled|canceled|out[- ]of[- ]delivery)\b/i.test(value)) {
      return { intent: "complex", toolNames: ["search_orders", "get_order_summary", "check_order_status"] };
    }

    if (/\b(sales|revenue|income|metrics|analytics|performance)\b/i.test(value)) {
      return { intent: "complex", toolNames: ["get_order_metrics", "search_orders"] };
    }

    return { intent: "complex" };
  }

  private routeSmalltalk(value: string): AdminRoute | null {
    const normalized = value
      .toLowerCase()
      .replace(/[!?.,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized || normalized.length > 120) return null;
    if (this.isGreeting(normalized)) return { intent: "smalltalk", reply: "Hello! How can I help with Empanada Hauz today?" };
    if (this.isThanks(normalized)) return { intent: "smalltalk", reply: "You're welcome! Happy to help." };
    if (/^(bye|goodbye|good night|see you|see ya|talk to you later|paalam|salamat bye)$/.test(normalized)) return { intent: "smalltalk", reply: "Goodbye! Have a great day." };
    if (/^(how are you|how are you doing|how is it going|kumusta ka|kumusta kayo|kamusta ka)$/.test(normalized)) return { intent: "smalltalk", reply: "I'm doing well and ready to help!" };
    if (/^(nice|great|awesome|perfect|great job|well done|sige|ayos|okay|ok|got it|i see)$/.test(normalized)) return { intent: "smalltalk", reply: "Got it! I'm ready for the next thing." };
    if (/^(i(?:'| a)m home|i am home|nasa bahay ako|nandito ako sa bahay|i am really at home|i'm really at home)$/.test(normalized)) return { intent: "smalltalk", reply: "Got it! I'm here with you. What would you like me to check?" };

    // Only use the short-sentence fallback when the turn is clearly casual.
    // Business lookup phrases are handled before this method so names like
    // "Find Tonnie" cannot be mistaken for smalltalk.
    const businessKeyword = /\b(order|orders|customer|customers|sales|sale|revenue|income|inventory|product|products|delivery|deliveries|rider|riders|kitchen|expense|expenses|analytics|metrics|performance|refund|cancel|reschedule|schedule|stock|business)\b/i;
    if (normalized.split(" ").length <= 8 && !businessKeyword.test(normalized)) {
      return { intent: "smalltalk", reply: "Got it! I'm listening. Tell me what you'd like me to do." };
    }

    return null;
  }

  private isGreeting(value: string) {
    return /^(hi|hello|hey|hey there|good morning|good afternoon|good evening|kumusta|kamusta|helo)(?: empanada hauz| empanada| there| team)?$/.test(value);
  }

  private isThanks(value: string) {
    return /^(thanks|thank you|thank you so much|thanks a lot|salamat|salamat kaayo|daghang salamat)(?: empanada hauz| everyone| all)?$/.test(value);
  }

  private isConfirmation(value: string) {
    return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed|no|nope|nah|cancel|stop|don't|do not)([.!\s]|$)/i.test(value);
  }

  private extractOperationalOrderStatus(message: string) {
    if (!/\b(order|orders)\b/i.test(message)) return null;

    if (/\b(pending|queued|awaiting|waiting)\b/i.test(message)) {
      return /\b(awaiting|waiting)\b/i.test(message) ? "awaiting_confirmation" : "queued";
    }

    if (/\b(completed|complete|delivered|done)\b/i.test(message)) return "completed";
    if (/\b(cancelled|canceled|cancel)\b/i.test(message)) return "cancelled";
    if (/\bout[- ]of[- ]delivery\b/i.test(message)) return "out_for_delivery";

    return null;
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
