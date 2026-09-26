import { BadRequestException, Injectable } from "@nestjs/common";
import { AiApplicationToolsService } from "./ai-application-tools.service";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiActionConfigDocument, AiActionConfigPatch, AiActionConfigService } from "./ai-action-config.service";
import { AiToolDefinition, AiToolExecutionContext, AiToolHandler } from "./ai-tool.types";
import { AiDateTimeService } from "./ai-datetime.service";
import { ProductsService } from "../products/products.service";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";

const DEFAULT_PICKUP_COORDINATES = { latitude: 10.2760457, longitude: 123.8466921 };

@Injectable()
export class AiToolRegistryService {
  constructor(
    private readonly applicationTools: AiApplicationToolsService,
    private readonly stateService: AiConversationStateService,
    private readonly productsService: ProductsService,
    private readonly deliveryNetworkService: DeliveryNetworkService,
    private readonly actionConfig: AiActionConfigService,
    private readonly aiDateTimeService: AiDateTimeService
  ) {}

  private toolsCache: { expiresAt: number; tools: AiToolDefinition[] } | null = null;
  private actionConfigCache: { expiresAt: number; configs: Map<string, AiActionConfigDocument> } | null = null;
  private readonly cacheTtlMs = 5000;

  private async getActionConfigs() {
    if (this.actionConfigCache && this.actionConfigCache.expiresAt > Date.now()) {
      return this.actionConfigCache.configs;
    }
    const configs = new Map((await this.actionConfig.list()).map((item) => [item.name, item]));
    this.actionConfigCache = { expiresAt: Date.now() + this.cacheTtlMs, configs };
    return configs;
  }

  private invalidateToolCache() {
    this.toolsCache = null;
    this.actionConfigCache = null;
  }

  async getTools(): Promise<AiToolDefinition[]> {
    if (this.toolsCache && this.toolsCache.expiresAt > Date.now()) return this.toolsCache.tools;

    const handlers = await this.handlers();
    const configs = await this.getActionConfigs();
    const names = new Set<string>();
    const tools = handlers
      .filter((handler) => handler.definition.name !== "get_delivery_pricing")
      .filter((handler) => configs.get(handler.definition.name)?.enabled ?? true)
      .map((handler) => {
        const config = configs.get(handler.definition.name);
        return { ...handler.definition, description: config?.description?.trim() || handler.definition.description };
      })
      .filter((tool) => !names.has(tool.name) && names.add(tool.name));

    this.toolsCache = { expiresAt: Date.now() + this.cacheTtlMs, tools };
    return tools;
  }

  async listApprovedExecutors() {
    return (await this.handlers()).filter((handler) => handler.definition.name !== "get_delivery_pricing").map((handler) => ({
      name: handler.definition.name,
      description: handler.definition.description,
      risk: handler.definition.risk,
      requiresCustomerContext: Boolean(handler.definition.requiresCustomerContext),
      requiresExplicitConfirmation: Boolean(handler.definition.requiresExplicitConfirmation),
      inputSchema: handler.definition.inputSchema
    }));
  }

  async listForAdmin() {
    const handlers = await this.handlers();
    const configs = new Map((await this.actionConfig.list()).map((item) => [item.name, item]));
    const builtIns = handlers.map((handler) => {
      const config = configs.get(handler.definition.name);
      return {
        name: handler.definition.name,
        label: config?.label ?? handler.definition.name,
        enabled: config?.enabled ?? true,
        description: config?.description ?? handler.definition.description,
        defaultDescription: handler.definition.description,
        risk: handler.definition.risk,
        requiresCustomerContext: Boolean(handler.definition.requiresCustomerContext),
        requiresExplicitConfirmation: Boolean(handler.definition.requiresExplicitConfirmation),
        inputSchema: handler.definition.inputSchema,
        configured: Boolean(config),
        custom: false,
        executor: handler.definition.name
      };
    });
    const custom = (await this.actionConfig.list()).filter((item) => item.custom).flatMap((config) => {
      const target = handlers.find((handler) => handler.definition.name === config.executor);
      if (!target) return [];
      return [{
        name: config.name,
        label: config.label ?? config.name,
        enabled: config.enabled,
        description: config.description ?? target.definition.description,
        defaultDescription: target.definition.description,
        risk: target.definition.risk,
        requiresCustomerContext: Boolean(target.definition.requiresCustomerContext),
        requiresExplicitConfirmation: Boolean(target.definition.requiresExplicitConfirmation),
        inputSchema: target.definition.inputSchema,
        configured: true,
        custom: true,
        executor: target.definition.name
      }];
    });
    return [...builtIns, ...custom];
  }

  async createCustomAction(input: { name?: string; label?: string; description?: string; executor?: string; enabled?: boolean }, createdById: string) {
    const handlers = await this.handlers();
    const executor = String(input.executor ?? "").trim();
    const target = handlers.find((handler) => handler.definition.name === executor);
    if (!target) throw new BadRequestException(`Unknown approved executor: ${executor}`);
    const name = String(input.name ?? "").trim();
    if (handlers.some((handler) => handler.definition.name === name)) throw new BadRequestException(`Action name is reserved: ${name}`);
    return this.actionConfig.createCustom({ name, label: String(input.label ?? "").trim(), description: String(input.description ?? "").trim(), executor, enabled: input.enabled }, createdById);
  }

  async configure(name: string, patch: AiActionConfigPatch, createdById: string) {
    const handler = (await this.handlers()).find((item) => item.definition.name === name);
    if (!handler) throw new BadRequestException(`Unknown AI action: ${name}`);
    const result = await this.actionConfig.upsert(name, patch, createdById, { description: handler.definition.description, executor: handler.definition.name });
    this.invalidateToolCache();
    return result;
  }

  async resetConfiguration(name: string) {
    const handler = (await this.handlers()).find((item) => item.definition.name === name);
    const config = (await this.getActionConfigs()).get(name);
    if (!handler && !config?.custom) throw new BadRequestException(`Unknown AI action: ${name}`);
    await this.actionConfig.remove(name);
    this.invalidateToolCache();
  }

  async execute(name: string, args: Record<string, unknown>, context: AiToolExecutionContext) {
    const handlers = await this.handlers();
    const direct = handlers.find((item) => item.definition.name === name);
    const config = await this.actionConfig.findByName(name);
    const handler = direct ?? (config?.custom ? handlers.find((item) => item.definition.name === config.executor) : undefined);
    if (!handler) throw new BadRequestException(`Unknown AI tool: ${name}`);
    if (config?.enabled === false) throw new BadRequestException(`AI action is disabled: ${name}`);
    if (handler.definition.requiresCustomerContext && !context.customerId) throw new BadRequestException(`Customer context is required for ${name}`);
    if (handler.definition.requiresExplicitConfirmation && args.confirmed !== true) throw new BadRequestException(`Explicit customer confirmation is required for ${name}`);
    return handler.execute(args, context);
  }

  private async handlers(): Promise<AiToolHandler[]> {
    return [
      {
        definition: { name: "list_products", description: "Read the current customer-facing menu and prices. Use for menu, flavor, product, or price questions.", risk: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        execute: async () => (await this.productsService.list({ availableOnly: true })).map((product) => ({
          name: product.name,
          description: product.description,
          price: product.price,
          available: product.available,
          aliases: product.aliases,
          tags: product.tags
        }))
      },
      {
        definition: { name: "get_product", description: "Read one available product by name or alias.", risk: "read", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },
        execute: async (args) => {
          const name = String(args.name ?? "").trim();
          const product = await this.productsService.resolveByName(name, { requireAvailable: true });
          if (!product) throw new BadRequestException(`Product not found or unavailable: ${name}`);
          return {
            name: product.name,
            description: product.description,
            price: product.price,
            available: product.available,
            aliases: product.aliases,
            tags: product.tags
          };
        }
      },
      {
        definition: { name: "get_delivery_pricing", description: "Internal delivery pricing configuration. Not customer-facing. Do not expose base-fare or per-km values to customers; use get_delivery_quote for an address-specific customer delivery fee.", risk: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        execute: async () => this.deliveryNetworkService.getDeliveryPricing()
      },
      {
        definition: { name: "get_delivery_quote", description: "Get the application-generated delivery fee estimate for a customer's destination. Use when the customer asks how much delivery will cost. Requires the customer's delivery address or landmark; do not substitute internal base/per-km pricing.", risk: "read", inputSchema: { type: "object", properties: { address: { type: "string" }, landmark: { type: "string" }, latitude: { type: "number" }, longitude: { type: "number" } }, additionalProperties: false } },
        execute: async (args) => {
          const address = String(args.address ?? "").trim();
          const landmark = String(args.landmark ?? "").trim();
          const parsedLatitude = Number(args.latitude);
          const parsedLongitude = Number(args.longitude);
          const hasCoordinates = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);
          const dropoffAddress = [landmark, address].filter(Boolean).join(", ");
          if (!dropoffAddress && !hasCoordinates) throw new BadRequestException("A delivery address or landmark is required to calculate the delivery fee.");
          const quote = await this.deliveryNetworkService.quoteJob({
            pickupAddress: "Empanada Hauz",
            pickupLatitude: DEFAULT_PICKUP_COORDINATES.latitude,
            pickupLongitude: DEFAULT_PICKUP_COORDINATES.longitude,
            dropoffAddress: dropoffAddress || "Customer location",
            ...(hasCoordinates ? { dropoffLatitude: parsedLatitude, dropoffLongitude: parsedLongitude } : {})
          });
          if (quote.distanceKm == null || typeof quote.estimatedFare !== "number") throw new BadRequestException("Unable to calculate a route-based delivery fee for that destination right now.");
          return quote;
        }
      },
      {
        definition: { name: "get_order_summary", description: "Read the customer's active order summary and details when they ask what they ordered or request their order details.", risk: "read", requiresCustomerContext: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false } },
        execute: async (args, context) => this.applicationTools.execute("get_order_summary", { ...args, customerId: context.customerId })
      },
      {
        definition: { name: "check_order_status", description: "Check the status of the customer's active order when they ask about tracking, progress, preparation, delivery, or current order status.", risk: "read", requiresCustomerContext: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" } }, additionalProperties: false } },
        execute: async (args, context) => this.applicationTools.execute("check_order_status", { ...args, customerId: context.customerId })
      },
      {
        definition: { name: "get_current_datetime", description: "Read the current date and time in Asia/Manila. Use this when resolving relative schedule requests such as today, tomorrow, or a relative weekday. Return the exact application value; do not guess the date.", risk: "read", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        execute: async () => this.aiDateTimeService.now()
      },
      {
        definition: { name: "capture_order_draft", description: "Persist the customer's current pending purchase request. Use when the customer expresses intent to buy or provides product/quantity information for a new order, including additions or changes to an unfinished order. This never creates a real order and should be used even when the customer's wording is colloquial or indirect. When the customer provides only a follow-up detail, preserve the existing draft and update only that detail.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: { items: { type: "array" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, address: { type: "string" }, landmark: { type: "string" }, contactNumber: { type: "string" }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, deliveryDate: { type: "string" }, preferredTime: { type: "string" } }, additionalProperties: false } },
        execute: async (args, context) => { const existing = await this.stateService.get(context.conversationId ?? "", context.customerId); const draft = { ...(existing?.draft ?? {}), ...args } as Record<string, unknown>; if (Array.isArray(args.items)) { draft.items = await Promise.all((args.items as Array<Record<string, unknown>>).map(async (item) => { const name = String(item.name ?? "").trim(); const quantity = Math.trunc(Number(item.quantity)); if (!name || !Number.isFinite(quantity) || quantity < 1) throw new BadRequestException("Each draft item requires a valid product name and positive quantity."); const product = await this.productsService.resolveByName(name, { requireAvailable: true }); if (!product) throw new BadRequestException(`Product not found or unavailable: ${name}`); return { name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity }; })); } if (Array.isArray(draft.items)) draft.quantity = draft.items.reduce((sum, item) => sum + Number((item as Record<string, unknown>).quantity ?? 0), 0); return this.stateService.saveDraft(context.conversationId ?? "", context.customerId, draft as never); }
      },
      {
        definition: { name: "clear_order_draft", description: "Clear the pending order draft without affecting a real order.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        execute: async (_args, context) => this.stateService.clear(context.conversationId ?? "", context.customerId)
      },
      {
        definition: { name: "create_order", description: "Create a real order from the customer's complete validated pending order after explicit confirmation. Before execution, combine the persisted pending draft with any explicitly supplied fields. Never infer missing required checkout data; let application validation reject an incomplete order.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { customerName: { type: "string" }, phoneNumber: { type: "string" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, preferredSchedule: { type: "string" }, items: { type: "array" }, notes: { type: "string" }, confirmed: { type: "boolean" } }, required: ["customerName", "quantity", "deliveryMethod", "paymentMethod", "items", "confirmed"], additionalProperties: false } },
        execute: async (args, context) => { const existing = await this.stateService.get(context.conversationId ?? "", context.customerId); const draft = (existing?.draft ?? {}) as Record<string, unknown>; const merged: Record<string, unknown> = { ...draft, ...args }; if (merged.phoneNumber === undefined && draft.contactNumber !== undefined) merged.phoneNumber = draft.contactNumber; if (merged.preferredSchedule === undefined) { const date = typeof draft.deliveryDate === "string" ? draft.deliveryDate : undefined; const time = typeof draft.preferredTime === "string" ? draft.preferredTime : undefined; if (date || time) merged.preferredSchedule = [date, time].filter(Boolean).join(" "); } if (merged.location === undefined && draft.landmark !== undefined) merged.location = draft.landmark; if (typeof merged.preferredSchedule === "string" && draft.preferredTime && /^(today|tomorrow)$/i.test(merged.preferredSchedule.trim())) merged.preferredSchedule = `${merged.preferredSchedule.trim()} ${draft.preferredTime}`; const result = await this.applicationTools.execute("create_order", { ...merged, customerId: context.customerId }); await this.stateService.clear(context.conversationId ?? "", context.customerId); return result; }
      },
      {
        definition: { name: "update_order", description: "Update an active customer order, including items, quantity, delivery, payment, address, or schedule. For schedule changes, the application validates that the order is still queued.", risk: "write", requiresCustomerContext: true, inputSchema: { type: "object", properties: { id: { type: "string" }, orderNumber: { type: "string" }, items: { type: "array" }, quantity: { type: "number" }, deliveryMethod: { type: "string", enum: ["pickup", "maxim"] }, paymentMethod: { type: "string", enum: ["cod", "gcash"] }, location: { type: "string" }, address: { type: "string" }, phoneNumber: { type: "string" }, preferredSchedule: { type: "string" } }, additionalProperties: false } },
        execute: async (args, context) => this.applicationTools.execute("update_order", { ...args, customerId: context.customerId })
      },
      {
        definition: { name: "cancel_order", description: "Cancel an active customer order when the customer requests cancellation and explicitly confirms the cancellation.", risk: "write", requiresCustomerContext: true, requiresExplicitConfirmation: true, inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["confirmed"], additionalProperties: false } },
        execute: async (args, context) => this.applicationTools.execute("cancel_order", { ...args, customerId: context.customerId })
      },
    ];
  }
}
