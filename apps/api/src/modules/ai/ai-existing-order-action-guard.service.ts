import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type AiResult = Awaited<ReturnType<AiService["classifyAndExtract"]>>;

type ExistingOrder = {
  id?: string;
  orderNumber: string;
  status: string;
  preferredSchedule?: string | Date | null;
};

@Injectable()
export class AiExistingOrderActionGuardService implements OnModuleInit {
  private readonly logger = new Logger(AiExistingOrderActionGuardService.name);

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

      const customerName = context?.customerName?.trim();
      if (!customerName) {
        return this.noOrderResult(context, "I couldn't identify your customer details. Please send your order ID so I can reschedule it.");
      }

      try {
        const listResult = await this.mcpOrders.listOrders({ customerName, limit: 100 });
        const order = listResult.orders?.find((candidate) => {
          const status = String(candidate.status);
          return !["completed", "cancelled"].includes(status);
        }) as ExistingOrder | undefined;

        if (!order?.id || !order.orderNumber) {
          return this.noOrderResult(context, "I couldn't find an active order under your details. Please send your order ID so I can reschedule it.");
        }

        const schedule = this.toTomorrowPreservingTime(order.preferredSchedule);
        if (!schedule) {
          return this.noOrderResult(context, "Your order doesn't have a scheduled time yet, so I couldn't reschedule it automatically.");
        }

        const updated = await this.mcpOrders.updateOrder({
          orderNumber: order.orderNumber,
          preferredSchedule: schedule
        }) as ExistingOrder;

        this.logger.log(`Rescheduled Messenger order ${updated.orderNumber} to tomorrow for customer=${JSON.stringify(customerName)}`);

        const result: AiResult = {
          intent: "inquiry",
          confidence: 1,
          details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
          suggestedReply: "Your order has been rescheduled for tomorrow. 😊",
          source: "ollama"
        };
        return result;
      } catch (error) {
        this.logger.warn(`Reschedule lookup/update failed: ${error instanceof Error ? error.message : String(error)}`);
        return this.noOrderResult(context, "I couldn't reschedule your order right now. Please send your order ID so I can check it.");
      }
    };
  }

  private noOrderResult(context: AiContext | undefined, suggestedReply: string): AiResult {
    return {
      intent: "inquiry",
      confidence: 1,
      details: context?.activeOrderState ?? { flavors: [], missingFields: [], confirmed: false },
      suggestedReply,
      source: "ollama"
    };
  }

  private isRescheduleRequest(message: string) {
    const lower = message.trim().toLowerCase();
    return /\b(?:reschedule|re-schedule|move|change)\b.*\b(?:my|the)?\s*order\b.*\b(?:tomorrow|ugma|next\s+day)\b/i.test(lower)
      || /\b(?:reschedule|re-schedule)\b.*\b(?:tomorrow|ugma|next\s+day)\b/i.test(lower)
      || /\b(?:tomorrow|ugma|next\s+day)\b.*\b(?:reschedule|re-schedule)\b/i.test(lower);
  }

  private toTomorrowPreservingTime(value?: string | Date | null) {
    if (!value) return undefined;
    const current = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
    if (Number.isNaN(current.getTime())) return undefined;

    const manilaParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(current);
    const get = (type: string) => manilaParts.find((part) => part.type === type)?.value;
    const year = Number(get("year"));
    const month = Number(get("month"));
    const day = Number(get("day"));
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (![year, month, day, hour, minute].every(Number.isFinite)) return undefined;

    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    const nextYear = tomorrow.getUTCFullYear();
    const nextMonth = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
    const nextDay = String(tomorrow.getUTCDate()).padStart(2, "0");
    return new Date(`${nextYear}-${nextMonth}-${nextDay}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`).toISOString();
  }
}
