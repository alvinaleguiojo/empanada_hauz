import { Injectable } from "@nestjs/common";
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

  async getTools(): Promise<AiToolDefinition[]> {
    return (await this.handlers()).map((handler) => handler.definition);
  }

  async execute(name: string, args: Record<string, unknown>, context: AiToolExecutionContext) {
    const handler = (await this.handlers()).find((item) => item.definition.name === name);
    if (!handler) throw new Error(`Unknown AI tool: ${name}`);
    if (handler.definition.requiresCustomerContext && !context.customerId) throw new Error(`Customer context is required for ${name}`);
    return handler.execute(args, context);
  }

  private async handlers(): Promise<AiToolHandler[]> {
    return [
      {
        definition: {
          name: "list_products",
          description: "List the currently available Empanada Hauz products and their live prices.",
          risk: "read",
          inputSchema: { type: "object", properties: {}, additionalProperties: false }
        },
        execute: async () => this.productsService.list({ availableOnly: true })
      },
      {
        definition: {
          name: "get_product",
          description: "Get one currently configured product by name or alias.",
          risk: "read",
          inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false }
        },
        execute: async (args) => {
          const name = String(args.name ?? "").trim();
          if (!name) throw new Error("Product name is required.");
          const product = await this.productsService.resolveByName(name, { requireAvailable: true });
          if (!product) throw new Error(`Product not found or unavailable: ${name}`);
          return product;
        }
      },
      {
        definition: {
          name: "get_delivery_pricing",
          description: "Get the current configured delivery base fare and per-kilometer rate.",
          risk: "read",
          inputSchema: { type: "object", properties: {}, additionalProperties: false }
        },
        execute: async () => this.deliveryNetworkService.getDeliveryPricing()
      },
      {
        definition: {
          name: "get_order_summary",
          description: "Read the customer's active order summary/details.",
          risk: "read",
          requiresCustomerContext: true,
          inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }
        },
        execute: async (args, context) => this.applicationTools.execute("get_order_summary", { ...args, customerId: context.customerId })
      },
      {
        definition: {
          name: "check_order_status",
          description: "Check the customer's active order status.",
          risk: "read",
          requiresCustomerContext: true,
          inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false }
        },
        execute: async (args, context) => this.applicationTools.execute("check_order_status", { ...args, customerId: context.customerId })
      },
      {
        definition: {
          name: "capture_order_draft",
          description: "Save the current order details as a pending conversation draft. This never creates a real order and should be used while collecting order information.",
          risk: "write",
          requiresCustomerContext: true,
          inputSchema: {
            type: "object",
            properties: {
              items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" }, subtotal: { type: "number" } }, required: ["name", "quantity"], additionalProperties: false } },
              quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, address: { type: "string" }, landmark: { type: "string" }, contactNumber: { type: "string" }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, deliveryDate: { type: "string" }, preferredTime: { type: "string" }
            },
            additionalProperties: false
          }
        },
        execute: async (args, context) => this.stateService.saveDraft(context.conversationId ?? "", context.customerId, args as never)
      },
      {
        definition: {
          name: "clear_order_draft",
          description: "Clear the current pending order draft without affecting a real database order.",
          risk: "write",
          requiresCustomerContext: true,
          inputSchema: { type: "object", properties: {}, additionalProperties: false }
        },
        execute: async (_args, context) => this.stateService.clear(context.conversationId ?? "", context.customerId)
      },
      {
        definition: {
          name: "create_order",
          description: "Create a real customer order from validated order details. Only use after the customer explicitly confirms a complete order.",
          risk: "write",
          requiresCustomerContext: true,
          requiresExplicitConfirmation: true,
          inputSchema: { type: "object", properties: { customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false }
        },
        execute: async (args, context) => this.applicationTools.execute("create_order", { ...args, customerId: context.customerId })
      },
      {
        definition: {
          name: "update_order",
          description: "Update an existing customer order after the target order and requested changes are identified.",
          risk: "write",
          requiresCustomerContext: true,
          inputSchema: { type: "object", properties: { id: { type: "string" }, orderNumber: { type: "string" }, items: { type: "array" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, phoneNumber: { type: "string" }, preferredSchedule: { type: "string" } }, additionalProperties: false }
        },
        execute: async (args, context) => this.applicationTools.execute("update_order", { ...args, customerId: context.customerId })
      },
      {
        definition: {
          name: "cancel_order",
          description: "Cancel the customer's active order. Cancellation must be explicitly requested by the customer.",
          risk: "write",
          requiresCustomerContext: true,
          requiresExplicitConfirmation: true,
          inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["confirmed"], additionalProperties: false }
        },
        execute: async (args, context) => this.applicationTools.execute("cancel_order", { ...args, customerId: context.customerId })
      },
      {
        definition: {
          name: "delete_order",
          description: "Delete an eligible active order only when the application allows it and the customer explicitly requests deletion.",
          risk: "write",
          requiresCustomerContext: true,
          requiresExplicitConfirmation: true,
          inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["confirmed"], additionalProperties: false }
        },
        execute: async (args, context) => this.applicationTools.execute("delete_order", { ...args, customerId: context.customerId })
      }
    ];
  }
}
