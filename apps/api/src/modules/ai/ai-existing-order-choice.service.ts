import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];
type AiResult = Awaited<ReturnType<AiService["classifyAndExtract"]>>;

@Injectable()
export class AiExistingOrderChoiceService implements OnModuleInit {
  private readonly logger = new Logger(AiExistingOrderChoiceService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly mcpOrders: McpOrdersService
  ) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);

    this.aiService.classifyAndExtract = async (message, context) => {
      if (!this.isNewOrderRequest(message)) {
        return original(message, context);
      }

      const customerName = context?.customerName?.trim();
      if (!customerName) {
        return original(message, context);
      }

      try {
        const listResult = await this.mcpOrders.listOrders({ customerName, limit: 100 });
        const hasActiveOrder = listResult.orders?.some((order) => {
          const status = String(order.status);
          return !["completed", "cancelled"].includes(status);
        });

        if (!hasActiveOrder) {
          return original(message, {
            ...context,
            activeOrderState: undefined
          });
        }

        this.logger.log(`Existing active order detected for customer=${JSON.stringify(customerName)}; asking whether to modify existing order or place a new order`);

        const result: AiResult = {
          intent: "inquiry",
          confidence: 1,
          details: { flavors: [], missingFields: [], confirmed: false },
          suggestedReply: "You already have an active order. Would you like to change your existing order or place a new order? 😊",
          source: "ollama"
        };
        return result;
      } catch (error) {
        this.logger.warn(`Existing-order check failed: ${error instanceof Error ? error.message : String(error)}`);
        return original(message, context);
      }
    };
  }

  private isNewOrderRequest(message: string) {
    const lower = message.trim().toLowerCase();
    if (!lower) return false;

    if (/\b(?:change|update|modify|edit|replace|switch|correct|correction|reschedule|re-schedule|remove|cancel)\b[\s\S]*\border\b/i.test(lower)) {
      return false;
    }

    return /^(?:i|we)\s+(?:would\s+like|want|would\s+love)\s+to\s+(?:place\s+)?(?:a\s+)?(?:new\s+)?order\b/i.test(lower)
      || /^(?:can|may)\s+(?:i|we)\s+(?:place\s+)?(?:a\s+)?(?:new\s+)?order\b/i.test(lower)
      || /\b(?:place|make|start)\s+(?:a\s+)?new\s+order\b/i.test(lower)
      || /\b(?:order|buy)\s+\d+\s*(?:pcs?|pieces?)\b/i.test(lower)
      || /\b(?:i|we)\s+(?:would\s+like|want)\s+to\s+order\b/i.test(lower);
  }
}
