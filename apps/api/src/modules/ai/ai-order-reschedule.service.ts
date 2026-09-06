import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AiService } from "./ai.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type Order = Awaited<ReturnType<McpOrdersService["getOrder"]>>;

@Injectable()
export class AiOrderRescheduleService implements OnModuleInit {
  private readonly logger = new Logger(AiOrderRescheduleService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly mcpOrders: McpOrdersService
  ) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      if (!this.isRescheduleRequest(message)) {
        return original(message, context);
      }

      const order = await this.findEditableOrder(context, this.extractOrderNumber(message));
      if (!order) {
        return {
          intent: "inquiry",
          confidence: 1,
          details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
          suggestedReply: "I couldn't find an active order to reschedule. Please send your order ID so I can update it.",
          source: "ollama"
        };
      }

      const tomorrow = this.getTomorrowManilaDate();
      const preferredSchedule = this.preserveExistingTime(order.preferredSchedule, tomorrow);

      try {
        const updated = await this.mcpOrders.updateOrder({
          orderNumber: order.orderNumber,
          preferredSchedule
        });

        this.logger.log(`Order rescheduled via MCP: ${updated.orderNumber} -> ${tomorrow}`);

        return {
          intent: "reservation",
          confidence: 1,
          details: {
            ...(context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false }),
            deliveryDate: tomorrow,
            preferredTime: this.extractExistingTime(order.preferredSchedule),
            confirmed: false
          },
          suggestedReply: "Your order has been rescheduled to tomorrow. 😊",
          source: "ollama"
        };
      } catch (error) {
        this.logger.warn(`Order reschedule failed via MCP: ${error instanceof Error ? error.message : String(error)}`);
        return {
          intent: "inquiry",
          confidence: 1,
          details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
          suggestedReply: "I couldn't reschedule your order right now. Please try again.",
          source: "ollama"
        };
      }
    };
  }

  private isRescheduleRequest(message: string) {
    const lower = message.trim().toLowerCase();
    return /\breschedul(?:e|ed|ing)\b/.test(lower)
      && /\b(?:my|the)\s+order\b/.test(lower)
      && /\b(?:tomorrow|tmrw|ugma)\b/.test(lower);
  }

  private extractOrderNumber(message: string) {
    const explicit = message.match(/\b(?:order\s*(?:id|number|no)\s*[:#-]?|order\s*#\s*)\s*([A-Za-z0-9-]{3,64})\b/i);
    return explicit?.[1]?.trim();
  }

  private async findEditableOrder(context?: AiContext, orderNumber?: string): Promise<Order | undefined> {
    const customerName = context?.customerName?.trim();

    try {
      if (orderNumber) {
        const order = await this.mcpOrders.getOrder({ orderNumber });
        if (
          customerName
          && order.customer?.name
          && order.customer.name.localeCompare(customerName, undefined, { sensitivity: "accent" }) !== 0
        ) {
          this.logger.warn(`Reschedule refused because order owner does not match customer context: order=${order.orderNumber}`);
          return undefined;
        }
        return this.isEditable(order) ? order : undefined;
      }

      if (!customerName) return undefined;

      const listResult = await this.mcpOrders.listOrders({ customerName, limit: 100 });
      const candidate = listResult.orders?.find((item) => this.isEditable(item));
      if (!candidate?.id) return undefined;

      const order = await this.mcpOrders.getOrder({ id: candidate.id });
      return this.isEditable(order) ? order : undefined;
    } catch (error) {
      this.logger.warn(`Reschedule order lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private isEditable(order: { status?: string }) {
    return !["completed", "cancelled"].includes(String(order.status));
  }

  private getTomorrowManilaDate() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);

    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));

    return `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
  }

  private preserveExistingTime(value: string | Date | null | undefined, date: string) {
    const time = this.extractExistingTime(value);
    return time ? `${date}T${time}:00+08:00` : `${date}T00:00:00+08:00`;
  }

  private extractExistingTime(value: string | Date | null | undefined) {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return undefined;

    const parts = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    if (!hour || !minute) return undefined;
    return `${hour}:${minute}`;
  }

  private formatManilaDate(value: string | Date | null | undefined) {
    if (!value) return "tomorrow";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return this.getTomorrowManilaDate();
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(date);
  }
}
