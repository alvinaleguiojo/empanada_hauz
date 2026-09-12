import { Injectable } from "@nestjs/common";
import { AdminRoute } from "./admin-agent.types";

/** Routes by capability, not by exact user phrasing. */
@Injectable()
export class AdminAgentRouterService {
  route(message: string): AdminRoute {
    const value = message.trim();
    if (this.isConfirmation(value)) return { intent: "confirmation" };

    if (this.isOrderWriteRequest(value)) {
      return { intent: "complex", toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };
    }

    const operationalStatus = this.extractOperationalOrderStatus(value);
    if (operationalStatus) {
      return { intent: "order_lookup", query: `__status__:${operationalStatus}`, toolNames: ["search_orders", "get_order_summary", "check_order_status"] };
    }

    const orderNumber = this.extractOrderNumber(value);
    if (orderNumber) {
      return { intent: "order_lookup", query: orderNumber, toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };
    }

    const orderSearch = this.extractOrderSearch(value);
    if (orderSearch) {
      return { intent: "order_lookup", query: orderSearch, toolNames: ["search_orders", "get_order_summary", "check_order_status", "update_order", "cancel_order"] };
    }

    const customer = this.extractCustomerSearch(value);
    if (customer) {
      return { intent: "customer_lookup", query: customer, toolNames: ["search_customers", "get_my_orders", "get_order_summary", "check_order_status"] };
    }

    const datetime = this.isDateTimeRequest(value);
    if (datetime) return { intent: "datetime", toolNames: ["get_current_datetime"] };

    if (this.isMenuRequest(value)) {
      return { intent: "product_lookup", toolNames: ["list_products", "get_product"] };
    }

    const priceQuery = this.extractPriceQuery(value);
    if (this.isPriceRequest(value)) {
      return { intent: "product_price", query: priceQuery ?? undefined, toolNames: ["get_product", "list_products"] };
    }

    if (this.isProductRequest(value)) {
      return { intent: "product_lookup", query: this.extractProductQuery(value) ?? undefined, toolNames: ["list_products", "get_product"] };
    }

    if (this.isMetricsRequest(value)) {
      return { intent: "metrics", toolNames: ["get_order_metrics", "search_orders"] };
    }

    const smalltalk = this.routeSmalltalk(value);
    if (smalltalk) return smalltalk;

    if (this.isOrderRequest(value)) return { intent: "complex", toolNames: ["search_orders", "get_order_summary", "check_order_status"] };
    if (this.isCustomerRequest(value)) return { intent: "complex", toolNames: ["search_customers", "get_my_orders", "get_order_summary", "check_order_status"] };
    if (this.isAnalyticsRequest(value)) return { intent: "complex", toolNames: ["get_order_metrics", "search_orders"] };
    return { intent: "complex" };
  }

  private isDateTimeRequest(value: string) {
    return /\b(what(?:'s| is) the (?:current )?(?:date|time)|what time is it|current (?:date|time)|today(?:'s)? date|today's date|what day is it|date today|time now|current datetime)\b/i.test(value);
  }

  private isMenuRequest(value: string) {
    return /\b(menu|menus|pricelist|price\s*list|price-list|what do you sell|what can i order|what can we order|what's available|whats available|show me the menu|send me the menu|send the menu|list the menu|list products)\b/i.test(value);
  }

  private isPriceRequest(value: string) {
    return /\b(price|prices|cost|costs|how much|how much is|how much does|pila|tag pila|magkano|magkano ang|presyo|presyo sa|tagpila)\b/i.test(value)
      || /\b(unsa|ano)\s+(ang\s+)?(?:presyo|price)\b/i.test(value);
  }

  private extractPriceQuery(value: string) {
    const normalized = value.replace(/[?!.]+$/g, "").trim();
    const patterns = [
      /^(?:how much)(?:\s+(?:is|does))?\s+(?:the\s+)?(.+)$/i,
      /^(?:what(?:'s| is)\s+(?:the\s+)?(?:price|cost)(?:\s+of|\s+for)?)\s+(.+)$/i,
      /^(?:price|cost)\s+(?:of|for|on)\s+(.+)$/i,
      /^(?:pila|tag\s*pila|tagpila|magkano)(?:\s+(?:ang|sa|for|of))?\s+(.+)$/i,
      /^(?:unsa|ano)\s+(?:ang\s+)?(?:presyo|price)(?:\s+(?:sa|of|for))?\s+(.+)$/i,
      /^(?:presyo)(?:\s+(?:sa|ng|of|for))?\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      const query = match?.[1]?.trim();
      if (query && !this.isGenericPricePhrase(query)) return query;
    }

    return null;
  }

  private isGenericPricePhrase(value: string) {
    return /^(?:it|that|this|the item|the product|something|anything|everything|all|all items|all products|menu|menus|price list|pricelist)$/i.test(value);
  }

  private isProductRequest(value: string) {
    return /\b(product|products|item|items|flavor|flavours|flavors|available|availability)\b/i.test(value);
  }

  private extractProductQuery(value: string) {
    const match = value.match(/(?:availability|available|product|item)\s+(?:of|for|is|on)?\s*(?:the\s+)?(.+?)(?:\s+available)?[?!.]*$/i);
    if (match?.[1]) return match[1].trim();
    return null;
  }

  private isMetricsRequest(value: string) {
    return /\b(how many|how much|count|number of|total|sum|sales|revenue|income|metrics|analytics|performance|order volume|sales volume)\b/i.test(value)
      && /\b(order|orders|sale|sales|revenue|income|metric|metrics|analytics|performance|volume|business)\b/i.test(value);
  }

  private isAnalyticsRequest(value: string) {
    return /\b(sales|revenue|income|metrics|analytics|performance|order volume|sales volume)\b/i.test(value);
  }

  private isOrderRequest(value: string) {
    return /\b(order|orders|delivery|status|pending|queued|completed|cancelled|canceled|out[- ]of[- ]delivery)\b/i.test(value);
  }

  private isCustomerRequest(value: string) {
    return /\b(customer|customers|client|clients|buyer|buyers)\b/i.test(value);
  }

  private isOrderWriteRequest(value: string) {
    return /\b(cancel|reschedule|update|change|edit|mark)\b/i.test(value) && /\border\b/i.test(value);
  }

  private routeSmalltalk(value: string): AdminRoute | null {
    const normalized = value.toLowerCase().replace(/[!?.,;:]+$/g, "").replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length > 120) return null;
    if (this.isGreeting(normalized)) return { intent: "smalltalk", reply: "Hello! How can I help with Empanada Hauz today?" };
    if (this.isThanks(normalized)) return { intent: "smalltalk", reply: "You're welcome! Happy to help." };
    if (/^(bye|goodbye|good night|see you|see ya|talk to you later|paalam|salamat bye)$/.test(normalized)) return { intent: "smalltalk", reply: "Goodbye! Have a great day." };
    if (/^(how are you|how are you doing|how is it going|kumusta ka|kumusta kayo|kamusta ka)$/.test(normalized)) return { intent: "smalltalk", reply: "I'm doing well and ready to help!" };
    if (/^(nice|great|awesome|perfect|great job|well done|sige|ayos|okay|ok|got it|i see)$/.test(normalized)) return { intent: "smalltalk", reply: "Got it! I'm ready for the next thing." };
    if (/^(i(?:'| a)m home|i am home|nasa bahay ako|nandito ako sa bahay|i am really at home|i'm really at home)$/.test(normalized)) return { intent: "smalltalk", reply: "Got it! I'm here with you. What would you like me to check?" };

    const businessKeyword = /\b(order|orders|customer|customers|sales|sale|revenue|income|inventory|product|products|menu|menus|pricelist|price\s*list|delivery|deliveries|rider|riders|kitchen|expense|expenses|analytics|metrics|performance|refund|cancel|reschedule|schedule|stock|business)\b/i;
    if (normalized.split(" ").length <= 8 && !businessKeyword.test(normalized)) return { intent: "smalltalk", reply: "Got it! I'm listening. Tell me what you'd like me to do." };
    return null;
  }

  private isGreeting(value: string) { return /^(hi|hello|hey|hey there|good morning|good afternoon|good evening|kumusta|kamusta|helo)(?: empanada hauz| empanada| there| team)?$/.test(value); }
  private isThanks(value: string) { return /^(thanks|thank you|thank you so much|thanks a lot|salamat|salamat kaayo|daghang salamat)(?: empanada hauz| everyone| all)?$/.test(value); }
  private isConfirmation(value: string) { return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|approve|approved|go ahead|do it|proceed|please do|please proceed|no|nope|nah|cancel|stop|don't|do not)([.!\s]|$)/i.test(value); }

  private extractOperationalOrderStatus(message: string) {
    if (!/\b(order|orders)\b/i.test(message)) return null;
    if (/\b(pending|queued|awaiting|waiting)\b/i.test(message)) return /\b(awaiting|waiting)\b/i.test(message) ? "awaiting_confirmation" : "queued";
    if (/\b(completed|complete|delivered|done)\b/i.test(message)) return "completed";
    if (/\bout[- ]of[- ]delivery\b/i.test(message)) return "out_for_delivery";
    if (/\b(cancelled|canceled)\b/i.test(message)) return "cancelled";
    return null;
  }

  private extractOrderNumber(message: string) {
    if (!/\border\b|^#/i.test(message)) return null;
    return message.match(/(?:order\s*#?\s*|#\s*)([0-9]{4,})\b/i)?.[1] ?? null;
  }

  private extractOrderSearch(message: string) {
    const patterns = [
      /^(?:find|search(?:\s+for)?|look\s+for|show|get|check|view|tell me about)\s+(?:an?\s+)?orders?\s+(?:for\s+)?(.+?)\s*\??$/i,
      /^(?:find|search(?:\s+for)?|look\s+for|show|get|check|view)\s+(.+?)(?:['’]s)?\s+orders?\s*\??$/i,
    ];
    for (const pattern of patterns) {
      const query = message.match(pattern)?.[1]?.trim();
      if (query && !/^orders?\b/i.test(query)) return query;
    }
    return null;
  }

  private extractCustomerSearch(message: string) {
    const patterns = [
      /^(?:find|search(?:\s+for)?|look\s+for|show|get|view|check)\s+(?:customer|client|buyer)\s+(.+?)\s*\??$/i,
      /^(?:who\s+is|tell\s+me\s+about|details\s+for|info(?:rmation)?\s+(?:for|on)|check\s+on)\s+(.+?)\s*\??$/i,
    ];
    for (const pattern of patterns) {
      const query = message.match(pattern)?.[1]?.trim();
      if (query && !/^(the|a|an)\s+customer\b/i.test(query)) return query;
    }
    const match = message.match(/^(?:find|search(?:\s+for)?|look\s+for)\s+(.+?)\s*\??$/i);
    if (!match) return null;
    const query = match[1].trim();
    if (!query || /^(orders?|customers?|clients?|buyers?)\b/i.test(query)) return null;
    return query;
  }
}
