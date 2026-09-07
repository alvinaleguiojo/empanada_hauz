import { BadRequestException, Injectable } from "@nestjs/common";
import { AiApplicationToolsService } from "./ai-application-tools.service";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiToolDefinition, AiToolExecutionContext, AiToolHandler } from "./ai-tool.types";
import { ProductsService } from "../products/products.service";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";

@Injectable()
export class AiToolRegistryService {
  constructor(
    private readonly applicationTools: AiApplicationToolsService,
    private readonly stateService: AiConversationStateService,
    private readonly productsService: ProductsService,
    private readonly deliveryNetworkService: DeliveryNetworkService
  ) {}

  async getTools(): Promise<AiToolDefinition[]> { return (await this.handlers()).map((handler) => handler.definition); }

  async execute(name: string, args: Record<string, unknown>, context: AiToolExecutionContext) {
    const handler = (await this.handlers()).find((item) => item.definition.name === name);
    if (!handler) throw new BadRequestException(`Unknown AI tool: ${name}`);
    if (handler.definition.requiresCustomerContext && !context.customerId) throw new BadRequestException(`Customer context is required for ${name}`);
    if (handler.definition.requiresExplicitConfirmation && args.confirmed !== true) throw new BadRequestException(`Explicit customer confirmation is required for ${name}`);
    return handler.execute(args, context);
  }

  private async handlers(): Promise<AiToolHandler[]> {
    return [
      { definition: { name: "list_products", description: "Read the live customer-facing product catalog. Use this whenever the customer wants to browse, view, see, know, compare, or ask about the shop's menu, products, available items, offerings, or their current prices. Interpret natural language semantically; do not require a specific keyword.", risk: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false } }, execute: async () => this.productsService.list({ availableOnly: true }) },
      { definition: { name: "get_product", description: "Read one specific available product by its name or alias when the customer asks about a particular item, flavor, or price.", risk: "read", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } }, execute: async (args) => { const name = String(args.name ?? "").trim(); const product = await this.productsService.resolveByName(name, { requireAvailable: true }); if (!product) throw new BadRequestException(`Product not found or unavailable: ${name}`); return product; } },
      { definition: { name: "get_delivery_pricing", description: "Read the current delivery pricing configuration when the customer asks about delivery charges, shipping cost, delivery rates, or how much delivery will cost.", risk: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false } }, execute: async () => this.deliveryNetworkService.getDeliveryPricing() },
      { definition: { name: "get_order_summary", description: "Read the customer's active order summary and details when they ask what they ordered or request their order details.", risk: "read", requiresCustomerContext: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("get_order_summary", { ...args, customerId: context.customerId }) },
      { definition: { name: "check_order_status", description: "Check the status of the customer's active order when they ask about tracking, progress, preparation, delivery, or current order status.", risk: "read", requiresCustomerContext: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("check_order_status", { ...args, customerId: context.customerId }) },
      { definition: { name: "capture_order_draft", description: "Persist the customer's current pending purchase request. Use when the customer expresses intent to buy or provides product/quantity information for a new order, including additions or changes to an unfinished order. This never creates a real order and should be used even when the customer's wording is colloquial or indirect. When the customer provides only a follow-up detail, preserve the existing draft and update only that detail.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: { items: { type: "array" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, address: { type: "string" }, landmark: { type: "string" }, contactNumber: { type: "string" }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, deliveryDate: { type: "string" }, preferredTime: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => {
        const existing = await this.stateService.get(context.conversationId ?? "", context.customerId);
        const draft = { ...(existing?.draft ?? {}), ...args } as Record<string, unknown>;
        if (Array.isArray(args.items)) {
          draft.items = await Promise.all((args.items as Array<Record<string, unknown>>).map(async (item) => {
            const name = String(item.name ?? "").trim(); const quantity = Math.trunc(Number(item.quantity));
            if (!name || !Number.isFinite(quantity) || quantity < 1) throw new BadRequestException("Each draft item requires a valid product name and positive quantity.");
            const product = await this.productsService.resolveByName(name, { requireAvailable: true });
            if (!product) throw new BadRequestException(`Product not found or unavailable: ${name}`);
            return { name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity };
          }));
        }
        if (Array.isArray(draft.items)) draft.quantity = draft.items.reduce((sum, item) => sum + Number((item as Record<string, unknown>).quantity ?? 0), 0);
        return this.stateService.saveDraft(context.conversationId ?? "", context.customerId, draft as never);
      } },
      { definition: { name: "clear_order_draft", description: "Clear the pending order draft without affecting a real order.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: {}, additionalProperties: false } }, execute: async (_args, context) => this.stateService.clear(context.conversationId ?? "", context.customerId) },
      { definition: { name: "create_order", description: "Create a real order from the customer's complete validated pending order after explicit confirmation. Before execution, combine the persisted pending draft with any explicitly supplied fields. Never infer missing required checkout data; let application validation reject an incomplete order.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false } }, execute: async (args, context) => {
        const existing = await this.stateService.get(context.conversationId ?? "", context.customerId);
        const draft = (existing?.draft ?? {}) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...draft, ...args };
        if (merged.phoneNumber === undefined && draft.contactNumber !== undefined) merged.phoneNumber = draft.contactNumber;
        if (merged.preferredSchedule === undefined) {
          const date = typeof draft.deliveryDate === "string" ? draft.deliveryDate : undefined;
          const time = typeof draft.preferredTime === "string" ? draft.preferredTime : undefined;
          if (date || time) merged.preferredSchedule = [date, time].filter(Boolean).join(" ");
        }
        if (merged.location === undefined && draft.landmark !== undefined) merged.location = draft.landmark;
        const result = await this.applicationTools.execute("create_order", { ...merged, customerId: context.customerId });
        await this.stateService.clear(context.conversationId ?? "", context.customerId);
        return result;
      } },
      { definition: { name: "update_order", description: "Update an existing active customer order when the customer asks to change its items, quantity, delivery, payment, address, or schedule.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: { id: { type: "string" }, orderNumber: { type: "string" }, items: { type: "array" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, phoneNumber: { type: "string" }, preferredSchedule: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("update_order", { ...args, customerId: context.customerId }) },
      { definition: { name: "cancel_order", description: "Cancel an active customer order when the customer requests cancellation and explicitly confirms the cancellation.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["confirmed"], additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("cancel_order", { ...args, customerId: context.customerId }) },
      { definition: { name: "delete_order", description: "Delete an eligible active order when the customer requests deletion and explicitly confirms the deletion.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["confirmed"], additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("delete_order", { ...args, customerId: context.customerId }) }
    ];
  }
}
