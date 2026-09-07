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
      { definition: { name: "list_products", description: "List currently available products and their live prices.", risk: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false } }, execute: async () => this.productsService.list({ availableOnly: true }) },
      { definition: { name: "get_product", description: "Get one available product by name or alias.", risk: "read", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } }, execute: async (args) => { const name = String(args.name ?? "").trim(); const product = await this.productsService.resolveByName(name, { requireAvailable: true }); if (!product) throw new BadRequestException(`Product not found or unavailable: ${name}`); return product; } },
      { definition: { name: "get_delivery_pricing", description: "Get the current configured delivery base fare and per-kilometer rate.", risk: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false } }, execute: async () => this.deliveryNetworkService.getDeliveryPricing() },
      { definition: { name: "get_order_summary", description: "Read the customer's active order summary/details.", risk: "read", requiresCustomerContext: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("get_order_summary", { ...args, customerId: context.customerId }) },
      { definition: { name: "check_order_status", description: "Check the customer's active order status.", risk: "read", requiresCustomerContext: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("check_order_status", { ...args, customerId: context.customerId }) },
      { definition: { name: "capture_order_draft", description: "Persist the current pending order draft. This never creates a real order.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: { items: { type: "array" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, address: { type: "string" }, landmark: { type: "string" }, contactNumber: { type: "string" }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, deliveryDate: { type: "string" }, preferredTime: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => this.stateService.saveDraft(context.conversationId ?? "", context.customerId, args as never) },
      { definition: { name: "clear_order_draft", description: "Clear the pending order draft without affecting a real order.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: {}, additionalProperties: false } }, execute: async (_args, context) => this.stateService.clear(context.conversationId ?? "", context.customerId) },
      { definition: { name: "create_order", description: "Create a real order from a complete validated draft after explicit customer confirmation.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false } }, execute: async (args, context) => { const result = await this.applicationTools.execute("create_order", { ...args, customerId: context.customerId }); await this.stateService.clear(context.conversationId ?? "", context.customerId); return result; } },
      { definition: { name: "update_order", description: "Update an existing customer order with requested changes.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: { id: { type: "string" }, orderNumber: { type: "string" }, items: { type: "array" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, phoneNumber: { type: "string" }, preferredSchedule: { type: "string" } }, additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("update_order", { ...args, customerId: context.customerId }) },
      { definition: { name: "cancel_order", description: "Cancel an active customer order after explicit confirmation.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["confirmed"], additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("cancel_order", { ...args, customerId: context.customerId }) },
      { definition: { name: "delete_order", description: "Delete an eligible active order after explicit confirmation.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["confirmed"], additionalProperties: false } }, execute: async (args, context) => this.applicationTools.execute("delete_order", { ...args, customerId: context.customerId }) }
    ];
  }
}
