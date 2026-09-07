import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiControlService } from "../ai/ai-control.service";
import { AiOrderActionService } from "../ai/ai-order-action.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { MetaAuthService } from "./meta-auth.service";

interface MetaParticipant { id?: string; name?: string }
interface MetaAttachment { type?: string; payload?: { url?: string; sticker_id?: string; [key: string]: unknown }; [key: string]: unknown }
interface MetaMessage { id?: string; message?: string; created_time?: string; from?: MetaParticipant; to?: { data?: MetaParticipant[] }; attachments?: { data?: MetaAttachment[] } | MetaAttachment[]; tags?: unknown; is_echo?: boolean }
interface MetaConversation { id: string; updated_time?: string; participants?: { data?: MetaParticipant[] } }
interface MetaPage<T> { data?: T[]; paging?: { next?: string } }

type OrderDetails = Awaited<ReturnType<AiService["classifyAndExtract"]>>["details"];
type LatestOrder = {
  id: string;
  orderNumber: string;
  status: string;
  quantity: number;
  deliveryMethod: string;
  paymentMethod: string;
  location: string | null;
  address: string | null;
  preferredSchedule: Date | null;
  items: unknown;
  customer: { phoneNumber: string | null };
};

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly aiControl: AiControlService,
    private readonly aiService: AiService,
    private readonly aiOrderActionService: AiOrderActionService,
    private readonly notificationsService: NotificationsService,
    private readonly mcpOrdersService: McpOrdersService,
    private readonly metaAuthService: MetaAuthService
  ) {}

  async processIncoming(event: { senderId: string; messageId?: string; text: string; rawPayload: unknown }) {
    this.logger.log(`Messenger AI processing started: sender=${event.senderId} messageId=${event.messageId ?? "unknown"}`);
    const stored = await this.persistInbound(event);
    this.logger.log(`Messenger inbound persisted: sender=${event.senderId} messageId=${event.messageId ?? "unknown"} message=${stored.id}`);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id: stored.conversationId }, include: { customer: true } });

    const aiState = await this.aiControl.getCustomerState(conversation.customer.id);
    if (!aiState.effectiveEnabled) {
      this.logger.log(`Messenger AI disabled: customer=${conversation.customer.id} sender=${event.senderId} override=${aiState.customerOverride} global=${aiState.globalEnabled}`);
      return { ai: null, reply: "", aiEnabled: false };
    }

    const recentMessages = await this.prisma.message.findMany({ where: { conversationId: stored.conversationId, id: { not: stored.id } }, orderBy: { createdAt: "desc" }, take: 20, select: { direction: true, content: true, extractedOrder: true } });
    const contextMessages = recentMessages.slice().reverse().map((item) => `${item.direction === "inbound" ? "Customer" : "Assistant"}: ${item.content}`);
    const persistedActiveOrderState = this.findLatestValidOrderState(recentMessages.map((item) => item.extractedOrder));
    const hasPendingNewOrder = Boolean(persistedActiveOrderState?.flavors?.some((item) => Number(item.quantity ?? 0) > 0));
    const customerName = conversation.customer?.name?.trim();
    const latestOrder = conversation.customer?.id
      ? await this.prisma.order.findFirst({
          where: { customerId: conversation.customer.id, status: { notIn: ["completed", "cancelled"] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, orderNumber: true, status: true, createdAt: true, quantity: true, unitPrice: true, totalAmount: true, deliveryFee: true, discountAmount: true, deliveryMethod: true, paymentMethod: true, location: true, address: true, preferredSchedule: true, items: true, customer: { select: { phoneNumber: true } } }
        })
      : customerName
        ? await this.prisma.order.findFirst({
            where: { status: { notIn: ["completed", "cancelled"] }, customer: { name: { equals: customerName, mode: Prisma.QueryMode.insensitive } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true, orderNumber: true, status: true, createdAt: true, quantity: true, unitPrice: true, totalAmount: true, deliveryFee: true, discountAmount: true, deliveryMethod: true, paymentMethod: true, location: true, address: true, preferredSchedule: true, items: true, customer: { select: { phoneNumber: true } } }
          })
        : null;

    const actionContext = await this.aiOrderActionService.analyze(event.text, {
      recentMessages: contextMessages,
      hasActiveOrder: Boolean(latestOrder),
      hasPendingNewOrder,
      existingDeliveryDetails: latestOrder ? { deliveryMethod: latestOrder.deliveryMethod, address: latestOrder.address, location: latestOrder.location, contactNumber: latestOrder.customer?.phoneNumber, paymentMethod: latestOrder.paymentMethod, preferredSchedule: latestOrder.preferredSchedule?.toISOString() } : undefined
    });

    const effectiveOrderAction = actionContext.orderAction;
    const inNewOrderFlow = effectiveOrderAction === "new_order" && (hasPendingNewOrder || (!latestOrder && actionContext.newOrderFlowActive));
    const shouldReuseExistingDelivery = actionContext.reuseExistingDelivery && inNewOrderFlow && Boolean(latestOrder);
    const reusedDeliveryState: Partial<OrderDetails> = shouldReuseExistingDelivery && latestOrder ? { deliveryMethod: latestOrder.deliveryMethod === "pickup" || latestOrder.deliveryMethod === "maxim" ? latestOrder.deliveryMethod : undefined, address: latestOrder.address ?? undefined, landmark: latestOrder.location ?? undefined, contactNumber: latestOrder.customer?.phoneNumber ?? undefined } : {};

    const baseState = persistedActiveOrderState;
    const activeOrderState: OrderDetails = { ...(baseState ?? {}), ...reusedDeliveryState, flavors: baseState?.flavors ?? [], missingFields: baseState?.missingFields ?? [], confirmed: false };
    const hasActiveOrderState = Boolean(activeOrderState.flavors.length || activeOrderState.quantity !== undefined || activeOrderState.deliveryMethod || activeOrderState.paymentMethod || activeOrderState.address || activeOrderState.location || activeOrderState.contactNumber);
    const orderValidation = hasActiveOrderState ? this.describeOrderValidation(activeOrderState) : "No active order state is available.";
    const latestOrderContext = latestOrder ? `LATEST DATABASE ORDER: orderNumber=${latestOrder.orderNumber}; status=${latestOrder.status}; createdAt=${latestOrder.createdAt.toISOString()}; scheduledAt=${latestOrder.preferredSchedule?.toISOString() ?? "none"}. This is factual database state. Do not claim the current order was placed unless this latest order clearly matches the current order.` : "LATEST DATABASE ORDER: none found for this customer. Therefore no order has been created in the database yet.";
    contextMessages.push(`APPLICATION ORDER VALIDATION: ${orderValidation}`);
    contextMessages.push(latestOrderContext);
    contextMessages.push(`APPLICATION AI ORDER ACTION: ${effectiveOrderAction}; newOrderFlowActive=${inNewOrderFlow}; reuseExistingDelivery=${shouldReuseExistingDelivery}`);
    if (shouldReuseExistingDelivery) contextMessages.push(`APPLICATION REUSED DELIVERY FACTS: deliveryMethod=${activeOrderState.deliveryMethod ?? "none"}; address=${activeOrderState.address ?? "none"}; landmark=${activeOrderState.landmark ?? "none"}; contactNumber=${activeOrderState.contactNumber ?? "none"}; paymentMethod=${activeOrderState.paymentMethod ?? "none"}`);

    this.logger.log(`Calling Qwen via Ollama: sender=${event.senderId} model=${this.config.get<string>("OLLAMA_MODEL", "qwen3:4b-instruct")}`);
    const ai = await this.aiService.classifyAndExtract(event.text, { customerName: conversation.customer?.name ?? undefined, recentMessages: contextMessages, activeOrderState: hasActiveOrderState ? activeOrderState : undefined });
    this.logger.log(`Qwen response received: sender=${event.senderId} intent=${ai.intent} confidence=${ai.confidence} confirmed=${Boolean(ai.details.confirmed)} missing=${JSON.stringify(ai.details.missingFields)} action=${effectiveOrderAction} newOrderFlowActive=${inNewOrderFlow} reuseExistingDelivery=${shouldReuseExistingDelivery}`);
    await this.prisma.message.update({ where: { id: stored.id }, data: { aiIntent: ai.intent, aiConfidence: ai.confidence, extractedOrder: ai.details as never, processedAt: new Date() } });

    let reply = ai.suggestedReply?.trim() ?? "";

    if (effectiveOrderAction === "new_order" && shouldReuseExistingDelivery) {
      reply = this.buildApplicationOrderSummary(activeOrderState, true);
    } else if (effectiveOrderAction === "new_order" && latestOrder && !inNewOrderFlow) {
      reply = "You already have an active order. Would you like to change your existing order or place a new order? 😊";
    } else if (effectiveOrderAction === "new_order" && inNewOrderFlow && ai.details.flavors.length && !this.isConfirmedOrder(ai)) {
      reply = this.buildNewOrderProgressReply(ai.details);
    } else if ((effectiveOrderAction === "new_order" || effectiveOrderAction === "confirm") && this.isConfirmedOrder(ai)) {
      try {
        const created = await this.createConfirmedOrder(ai, conversation.customer?.name || "Messenger Customer", event.text);
        this.notificationsService.notify("order.created_from_messenger", { conversationId: conversation.id, senderId: event.senderId, orderId: created.id, orderNumber: created.orderNumber });
        this.logger.log(`Created confirmed Messenger order ${created.orderNumber} for ${event.senderId} via MCP order service`);
        const createdReply = await this.aiService.generateOrderResultReply("created", created.orderNumber);
        reply = `${createdReply}\nTrack your order here: ${this.trackingUrl(created.id)}`;
      } catch (error) {
        this.logger.error(`Confirmed Messenger order could not be created for ${event.senderId}`, error instanceof Error ? error.stack : String(error));
        try { reply = await this.aiService.generateOrderResultReply("failed"); }
        catch (replyError) { this.logger.error(`Qwen order-result reply generation failed for ${event.senderId}`, replyError instanceof Error ? replyError.stack : String(replyError)); reply = ai.suggestedReply?.trim() ?? ""; }
      }
    } else if (effectiveOrderAction === "modify_existing") {
      const requestedOrder = await this.findOrderForModification(conversation.customer.id, actionContext.referencedOrderDate, actionContext.requestedDeliveryDate, latestOrder);
      this.logger.log(`Messenger modify order selection: action=modify_existing referencedOrderDate=${actionContext.referencedOrderDate ?? "none"} selectedOrder=${requestedOrder?.orderNumber ?? "none"} selectedScheduledAt=${requestedOrder?.preferredSchedule?.toISOString() ?? "none"}`);

      if (!requestedOrder) {
        reply = actionContext.referencedOrderDate
          ? `I couldn't find an active order scheduled for ${this.formatReferenceDate(actionContext.referencedOrderDate)}. I won't change another order by mistake. 😊`
          : "I couldn't find an active order to update. 😊";
      } else if (this.shouldUpdateCustomerOrder(ai.intent, ai.details, requestedOrder)) {
        try {
          const updated = await this.updateCustomerOrderFromAi(ai, requestedOrder.orderNumber, actionContext.requestedDeliveryDate, actionContext.requestedDeliveryTime);
          this.logger.log(`Updated Messenger order ${updated.orderNumber} for ${event.senderId}`);
          reply = this.buildOrderUpdatedReply(updated.orderNumber, updated.preferredSchedule);
        } catch (error) {
          this.logger.error(`Customer order update failed for ${event.senderId}`, error instanceof Error ? error.stack : String(error));
          reply = "I couldn't update the order right now. Please try again. 😊";
        }
      } else {
        reply = ai.suggestedReply?.trim() || "I didn't find any order detail that needs changing. 😊";
      }
    }

    if (reply) {
      this.logger.log(`Sending Qwen Messenger reply: sender=${event.senderId}`);
      try { await this.sendText(event.senderId, reply); this.logger.log(`Qwen Messenger reply sent: sender=${event.senderId}`); }
      catch (error) { this.logger.error(`Failed to send Qwen Messenger reply to ${event.senderId}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { ai, reply, aiEnabled: true };
  }

  private buildNewOrderProgressReply(details: OrderDetails) {
    const flavors = details.flavors.length ? details.flavors.map((item) => `${item.quantity} pcs ${item.name}`).join(", ") : "your selected items";
    const foodTotal = `₱${details.totalAmount ?? 0}`;
    const missing = new Set(details.missingFields ?? []);
    if (missing.has("flavors")) return "Sure! What flavor would you like to order? 😊";
    if (missing.has("quantity")) return `Sure! How many pcs of ${details.flavors[0]?.name ?? "that flavor"} would you like? 😊`;
    if (missing.has("minimumOrder")) return "Our minimum order is 10 pcs. How many would you like? 😊";
    if (missing.has("deliveryMethod")) return `Sure! ${flavors} is ${foodTotal}. Would you like Pickup or Maxim delivery? 😊`;
    if (missing.has("address") || missing.has("landmark") || missing.has("contactNumber")) { const deliveryMissing = ["address", "landmark", "contactNumber"].filter((field) => missing.has(field)); return `Sure! For Maxim delivery, please send your ${deliveryMissing.map((field) => field === "address" ? "Address" : field === "landmark" ? "Landmark" : "Contact #").join(", ")}. 😊`; }
    if (missing.has("paymentMethod")) return `Great! Your current order is ${flavors} for ${foodTotal}. Would you like to pay via GCash or COD? 😊`;
    if (details.missingFields.length === 0) return this.buildApplicationOrderSummary(details, false);
    return `Sure! Your current order is ${flavors} for ${foodTotal}. What would you like to provide next? 😊`;
  }

  private buildApplicationOrderSummary(details: OrderDetails, reusedDelivery: boolean) {
    const flavorLines = details.flavors.length
      ? details.flavors.map((item) => `• ${item.quantity} pcs ${item.name} — ₱${Number(item.unitPrice ?? 0).toFixed(2)} each`).join("\n")
      : "• Your selected items";
    const total = Number(details.totalAmount ?? 0).toFixed(2);
    const intro = reusedDelivery
      ? "Sure — I’ll keep your existing delivery details for this new order. Here’s the updated summary:"
      : "Here’s your order summary:";
    const lines = [intro, "", "🛒 Order details", flavorLines, `Total food amount: ₱${total}`, "", "🚚 Delivery", `Method: ${details.deliveryMethod === "maxim" ? "Maxim" : details.deliveryMethod === "pickup" ? "Pickup" : this.titleCase(details.deliveryMethod ?? "")}`];
    if (details.address?.trim()) lines.push(`Address: ${details.address.trim()}`);
    if (details.landmark?.trim()) lines.push(`Landmark: ${details.landmark.trim()}`);
    if (details.contactNumber?.trim()) lines.push(`Contact #: ${details.contactNumber.trim()}`);
    lines.push("", "💳 Payment", `Method: ${details.paymentMethod === "cod" ? "COD" : details.paymentMethod === "gcash" ? "GCash" : this.titleCase(details.paymentMethod ?? "")}`);
    if (details.deliveryDate?.trim()) lines.push("", "📅 Delivery date", details.deliveryDate.trim());
    if (details.preferredTime?.trim()) lines.push(`Preferred time: ${details.preferredTime.trim()}`);
    lines.push("", "Please confirm that all the details above are correct. 😊");
    return lines.join("\n").trim();
  }

  private buildOrderUpdatedReply(orderNumber: string, preferredSchedule: Date | null) {
    if (!preferredSchedule) return `Done — your order #${orderNumber} has been updated successfully. 😊`;
    const formatted = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(preferredSchedule);
    return `Done — I rescheduled order #${orderNumber} to ${formatted}. Your existing order was updated; no new order was created. 😊`;
  }

  private formatReferenceDate(value: string) {
    const parsed = new Date(`${value}T00:00:00+08:00`);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(parsed);
  }

  private titleCase(value: string) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
  async getAiSettings() { return this.aiControl.getState(); }
  async setGlobalAiEnabled(enabled: boolean) { this.logger.warn(`Messenger AI global switch changed: enabled=${enabled}`); return this.aiControl.setGlobalEnabled(enabled); }
  async getCustomerAiSettings(customerId: string) { return this.aiControl.getCustomerState(customerId); }
  async setCustomerAiEnabled(customerId: string, enabled: boolean | null) { return this.aiControl.setCustomerOverride(customerId, enabled); }

  private findLatestValidOrderState(values: unknown[]): OrderDetails | undefined {
    for (const value of values) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const candidate = value as Partial<OrderDetails>;
      const flavors = Array.isArray(candidate.flavors) ? candidate.flavors : [];
      const hasOrderData = flavors.length > 0 || candidate.quantity !== undefined || candidate.deliveryMethod || candidate.paymentMethod || candidate.address || candidate.location || candidate.contactNumber;
      if (!hasOrderData) continue;
      const hasMeaningfulOrderState = flavors.some((item) => Number((item as Record<string, unknown>)?.quantity ?? 0) > 0) || candidate.quantity !== undefined || candidate.deliveryMethod || candidate.paymentMethod;
      if (hasMeaningfulOrderState) return { ...candidate, flavors: flavors as OrderDetails["flavors"], missingFields: Array.isArray(candidate.missingFields) ? candidate.missingFields : [], confirmed: Boolean(candidate.confirmed) };
    }
    return undefined;
  }

  private trackingUrl(orderId: string) { const baseUrl = (this.config.get<string>("PUBLIC_APP_URL") ?? "https://www.empanadahauz.com").replace(/\/$/, ""); return `${baseUrl}/track/${orderId}`; }

  private async findActiveOrderByScheduleDate(customerId: string, dateValue: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
    const start = new Date(`${dateValue}T00:00:00+08:00`);
    const end = new Date(`${dateValue}T00:00:00+08:00`);
    end.setUTCDate(end.getUTCDate() + 1);
    return this.prisma.order.findFirst({
      where: { customerId, status: { notIn: ["completed", "cancelled"] }, preferredSchedule: { gte: start, lt: end } },
      orderBy: [{ preferredSchedule: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, orderNumber: true, status: true, quantity: true, deliveryMethod: true, paymentMethod: true, location: true, address: true, preferredSchedule: true, items: true, customer: { select: { phoneNumber: true } } }
    });
  }

  private async findOrderForModification(customerId: string, referencedOrderDate: string | undefined, requestedDeliveryDate: string | undefined, latestOrder: LatestOrder | null) {
    if (!referencedOrderDate) return latestOrder;

    const scheduledOrder = await this.findActiveOrderByScheduleDate(customerId, referencedOrderDate);
    if (scheduledOrder) return scheduledOrder;

    const today = this.getTodayDate();
    const isTodaySource = referencedOrderDate === today;
    const isMovingToAnotherDate = Boolean(requestedDeliveryDate && requestedDeliveryDate !== referencedOrderDate);
    if (isTodaySource && isMovingToAnotherDate && latestOrder && !latestOrder.preferredSchedule) {
      this.logger.log(`No active order is scheduled for today; falling back to latest unscheduled active order ${latestOrder.orderNumber} for today's reschedule request`);
      return latestOrder;
    }

    return null;
  }

  private shouldUpdateCustomerOrder(intent: string, details: OrderDetails, latestOrder: LatestOrder) {
    if (["completed", "cancelled"].includes(latestOrder.status)) return false;
    if (["inquiry", "pricing_question", "delivery_request", "pickup_request"].includes(intent) && !details.flavors.length && details.deliveryDate === undefined && details.preferredTime === undefined) return false;
    if (!details.flavors.length && details.quantity === undefined && !details.deliveryMethod && !details.paymentMethod && details.address === undefined && details.location === undefined && details.contactNumber === undefined && details.deliveryDate === undefined && details.preferredTime === undefined) return false;
    const existingItems = Array.isArray(latestOrder.items) ? latestOrder.items.map((item) => ({ name: String((item as Record<string, unknown>)?.name ?? ""), quantity: Number((item as Record<string, unknown>)?.quantity ?? 0) })).filter((item) => item.name) : [];
    const newItems = details.flavors.map((item) => ({ name: item.name, quantity: Number(item.quantity) }));
    const itemsChanged = details.flavors.length > 0 && JSON.stringify(existingItems) !== JSON.stringify(newItems);
    const quantityChanged = details.quantity !== undefined && Number(details.quantity) !== Number(latestOrder.quantity);
    const deliveryChanged = details.deliveryMethod !== undefined && details.deliveryMethod !== latestOrder.deliveryMethod;
    const paymentChanged = details.paymentMethod !== undefined && details.paymentMethod !== latestOrder.paymentMethod;
    const locationChanged = details.location !== undefined && details.location !== (latestOrder.location ?? undefined);
    const addressChanged = details.address !== undefined && details.address !== (latestOrder.address ?? undefined);
    const contactChanged = details.contactNumber !== undefined && details.contactNumber !== (latestOrder.customer.phoneNumber ?? undefined);
    const proposedSchedule = details.deliveryDate && details.preferredTime ? this.toManilaIso(details.deliveryDate, details.preferredTime) : undefined;
    const scheduleChanged = proposedSchedule !== undefined && proposedSchedule !== (latestOrder.preferredSchedule?.toISOString() ?? undefined);
    const dateOnlyChange = details.deliveryDate !== undefined && details.preferredTime === undefined;
    const timeOnlyChange = details.preferredTime !== undefined && details.deliveryDate === undefined;
    return itemsChanged || quantityChanged || deliveryChanged || paymentChanged || locationChanged || addressChanged || contactChanged || scheduleChanged || dateOnlyChange || timeOnlyChange;
  }

  private async updateCustomerOrderFromAi(ai: Awaited<ReturnType<AiService["classifyAndExtract"]>>, orderNumber: string, requestedDeliveryDate?: string, requestedDeliveryTime?: string) {
    const details = ai.details;
    const flavors = details.flavors ?? [];
    const deliveryDate = requestedDeliveryDate || details.deliveryDate;
    const deliveryTime = requestedDeliveryTime || details.preferredTime;
    let preferredSchedule: string | undefined;
    if (deliveryDate && deliveryTime) {
      preferredSchedule = this.toManilaIso(deliveryDate, deliveryTime);
    } else if (deliveryDate) {
      preferredSchedule = await this.mergeDateWithExistingOrderTime(deliveryDate, orderNumber);
    } else if (deliveryTime) {
      preferredSchedule = this.toManilaIso(this.getTodayDate(), deliveryTime);
    }
    return this.mcpOrdersService.updateOrder({ orderNumber, ...(flavors.length ? { items: flavors.map((item) => ({ name: item.name, quantity: item.quantity, price: item.unitPrice, subtotal: item.subtotal })) } : {}), ...(details.quantity !== undefined ? { quantity: Number(details.quantity) } : {}), ...(details.deliveryMethod ? { deliveryMethod: details.deliveryMethod } : {}), ...(details.paymentMethod ? { paymentMethod: details.paymentMethod } : {}), ...(details.address !== undefined ? { address: details.address } : {}), ...(details.location !== undefined ? { location: details.location } : {}), ...(details.contactNumber !== undefined ? { phoneNumber: details.contactNumber } : {}), ...(preferredSchedule ? { preferredSchedule } : {}) });
  }

  private async mergeDateWithExistingOrderTime(date: string, orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, select: { preferredSchedule: true } });
    if (!order?.preferredSchedule) return this.toManilaIso(date, "12:00");
    const scheduleParts = this.getScheduleParts(order.preferredSchedule);
    return this.toManilaIso(date, scheduleParts.time ?? "12:00");
  }

  private getTodayDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()); }

  private toManilaIso(date?: string, time?: string) {
    if (!date || !time) return undefined;
    if (/^\d{4}-\d{2}-\d{2}T/.test(time)) return new Date(time).toISOString();
    const match = time.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i); if (!match) return undefined;
    let hour = Number(match[1]); const minute = Number(match[2]); const meridiem = match[3]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12; if (meridiem === "AM" && hour === 12) hour = 0; if (hour > 23 || minute > 59) return undefined;
    return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`).toISOString();
  }

  private getScheduleParts(value: Date) {
    const parts = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(value);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour");
    const minute = get("minute");
    const date = year && month && day ? `${year}-${month}-${day}` : undefined;
    const time = hour && minute ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` : undefined;
    return { date, time };
  }

  private describeOrderValidation(details: OrderDetails) {
    const missing = Array.isArray(details.missingFields) ? details.missingFields : [];
    if (missing.length === 0 && details.flavors.length > 0) return "READY for MCP placement only if the current customer message is an explicit confirmation. The application has all required order fields.";
    return `NOT READY for MCP placement. Missing required fields: ${missing.length ? missing.join(", ") : "order details"}. A customer confirmation must not be described as an order being placed.`;
  }

  private isConfirmedOrder(ai: Awaited<ReturnType<AiService["classifyAndExtract"]>>) {
    const details = ai.details;
    const quantity = Number(details.quantity ?? 0);
    const flavors = details.flavors ?? [];
    const flavorQuantity = flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const deliveryComplete = details.deliveryMethod === "pickup" || (details.deliveryMethod === "maxim" && Boolean(details.address?.trim() && details.landmark?.trim() && details.contactNumber?.trim()));
    const requiredFieldsPresent = flavors.length > 0 && flavorQuantity === quantity && quantity >= 10 && Boolean(details.deliveryMethod && details.paymentMethod) && deliveryComplete;
    return Boolean(details.confirmed) && requiredFieldsPresent && details.missingFields.length === 0;
  }

  private async createConfirmedOrder(ai: Awaited<ReturnType<AiService["classifyAndExtract"]>>, customerName: string, originalMessage: string) {
    const details = ai.details; const flavors = details.flavors ?? [];
    return this.mcpOrdersService.createOrder({ customerName, phoneNumber: details.contactNumber, quantity: Number(details.quantity), deliveryMethod: details.deliveryMethod, paymentMethod: details.paymentMethod, location: details.landmark, address: details.address, preferredSchedule: this.toManilaIso(details.deliveryDate, details.preferredTime), items: flavors.map((item) => ({ name: item.name, quantity: item.quantity, price: item.unitPrice, subtotal: item.subtotal })), notes: `Confirmed via Messenger. Original confirmation: ${originalMessage}` });
  }

  async handleStandbyEvent(event: { senderId: string; messageId?: string; text?: string; rawPayload: unknown }) {
    const text = event.text; if (text) await this.persistInbound({ senderId: event.senderId, messageId: event.messageId, text, rawPayload: event.rawPayload });
    const autoRequest = this.config.get<string>("META_AUTO_REQUEST_THREAD_CONTROL")?.toLowerCase() === "true"; if (!autoRequest) return { action: "observed" as const };
    const result = await this.requestThreadControl(event.senderId, "Empanada Hauz backend requests control after receiving a standby message");
    return { action: result ? "thread_control_requested" as const : "thread_control_request_failed" as const };
  }

  verify(mode?: string, token?: string, challenge?: string) { if (mode === "subscribe" && token === this.config.get<string>("META_VERIFY_TOKEN")) return challenge ?? ""; return null; }
  private graphVersion() { return this.config.get<string>("META_GRAPH_API_VERSION") ?? "v26.0"; }
  private pageId() { return this.config.get<string>("META_PAGE_ID") ?? ""; }

  async getMessengerProfileName(psid: string) {
    try {
      const profile = await this.metaGet<{ name?: string; first_name?: string; last_name?: string }>(`https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}?fields=name,first_name,last_name`);
      const name = profile.name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
      return name || undefined;
    } catch (err) { this.logger.warn(`Unable to fetch Messenger profile name for ${psid}: ${err instanceof Error ? err.message : String(err)}`); return undefined; }
  }

  private async metaGet<T>(url: string): Promise<T> {
    const token = await this.metaAuthService.getPageToken(); if (!token) throw new Error("Meta Page authentication is not configured. Reconnect Meta first.");
    const requestUrl = new URL(url); requestUrl.searchParams.set("access_token", token); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
    try { const response = await fetch(requestUrl, { headers: { accept: "application/json" }, signal: controller.signal }); const body = await response.text(); if (!response.ok) throw new Error(`Meta Graph API failed: ${response.status} ${body}`); return JSON.parse(body) as T; }
    finally { clearTimeout(timeout); }
  }

  private async metaPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const token = await this.metaAuthService.getPageToken(); if (!token) throw new Error("Meta Page authentication is not configured. Reconnect Meta first.");
    const endpoint = `https://graph.facebook.com/${this.graphVersion()}${path}`; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    try { const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal }); const responseBody = await response.text(); if (!response.ok) throw new Error(`Meta Graph API POST failed: ${response.status} ${responseBody}`); return JSON.parse(responseBody) as T; }
    finally { clearTimeout(timeout); }
  }

  async requestThreadControl(psid: string, metadata?: string) {
    this.logger.warn(`Requesting Messenger thread control: psid=${psid}`);
    try { const result = await this.metaPost<{ success?: boolean }>("/me/request_thread_control", { recipient: { id: psid }, ...(metadata ? { metadata } : {}) }); this.logger.log(`Messenger thread control request result: psid=${psid} success=${Boolean(result.success)}`); return Boolean(result.success); }
    catch (err) { this.logger.error(`Messenger thread control request failed: psid=${psid}`, err instanceof Error ? err.message : String(err)); return false; }
  }

  async syncFromMeta(options: { maxConversations?: number; maxMessagesPerConversation?: number } = {}) {
    await this.metaAuthService.ensureAuthenticated();
    const maxConversations = Math.max(1, options.maxConversations ?? 100); const maxMessagesPerConversation = Math.max(1, options.maxMessagesPerConversation ?? 1000);
    const pageId = this.pageId(); if (!pageId) throw new Error("META_PAGE_ID is not configured");
    let nextUrl: string | undefined = `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}/conversations?fields=id,participants,updated_time&limit=100`;
    let conversationsSeen = 0, conversationsImported = 0, messagesImported = 0;
    while (nextUrl && conversationsSeen < maxConversations) {
      const page: MetaPage<MetaConversation> = await this.metaGet<MetaPage<MetaConversation>>(nextUrl);
      for (const metaConversation of page.data ?? []) {
        if (conversationsSeen >= maxConversations) break;
        conversationsSeen += 1;
        const participant = this.findCustomerParticipant(metaConversation.participants?.data ?? [], pageId);
        if (!participant?.id) { this.logger.warn(`Skipping Meta conversation ${metaConversation.id}: no customer participant found`); continue; }
        const customer = await this.customersService.findOrCreateByMessenger(participant.id, participant.name || "Messenger Customer");
        let conversation = await this.prisma.conversation.findFirst({ where: { metaConversationId: metaConversation.id } });
        if (!conversation) conversation = await this.prisma.conversation.create({ data: { customerId: customer.id, channel: "messenger", metaConversationId: metaConversation.id, ...(metaConversation.updated_time ? { updatedAt: new Date(metaConversation.updated_time) } : {}) } });
        else conversation = await this.prisma.conversation.update({ where: { id: conversation.id }, data: { customerId: customer.id, channel: "messenger", ...(metaConversation.updated_time ? { updatedAt: new Date(metaConversation.updated_time) } : {}) } });
        conversationsImported += 1;
        let messageUrl: string | undefined = `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(metaConversation.id)}/messages?fields=id,message,created_time,from,to,attachments,tags&limit=100`;
        let conversationMessageCount = 0; let newestMessage: MetaMessage | undefined;
        while (messageUrl && conversationMessageCount < maxMessagesPerConversation) {
          const messagesPage: MetaPage<MetaMessage> = await this.metaGet<MetaPage<MetaMessage>>(messageUrl);
          for (const metaMessage of messagesPage.data ?? []) {
            if (conversationMessageCount >= maxMessagesPerConversation || !metaMessage.id) break;
            conversationMessageCount += 1;
            if (!newestMessage || this.messageTime(metaMessage) > this.messageTime(newestMessage)) newestMessage = metaMessage;
            const existing = await this.prisma.message.findFirst({ where: { metaMessageId: metaMessage.id } });
            const data = { conversationId: conversation.id, metaMessageId: metaMessage.id, direction: (metaMessage.from?.id === pageId ? "outbound" : "inbound") as "outbound" | "inbound", type: (this.hasAttachments(metaMessage) ? "attachment" : "text") as "attachment" | "text", content: this.messageContent(metaMessage), rawPayload: metaMessage as never, ...(metaMessage.created_time ? { createdAt: new Date(metaMessage.created_time) } : {}) };
            if (existing) await this.prisma.message.update({ where: { id: existing.id }, data }); else await this.prisma.message.create({ data }); messagesImported += 1;
          }
          if (conversationMessageCount >= maxMessagesPerConversation) break;
          messageUrl = messagesPage.paging?.next;
        }
        if (newestMessage) await this.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessage: this.messageContent(newestMessage), ...(newestMessage.created_time ? { updatedAt: new Date(newestMessage.created_time) } : {}) } });
      }
      nextUrl = page.paging?.next;
    }
    return { conversationsSeen, conversationsImported, messagesImported, maxConversations, maxMessagesPerConversation };
  }

  private findCustomerParticipant(participants: MetaParticipant[], pageId: string) { return participants.find((participant) => participant.id && participant.id !== pageId); }
  private messageTime(message: MetaMessage) { return message.created_time ? Date.parse(message.created_time) : 0; }
  private attachmentList(message: MetaMessage): MetaAttachment[] { if (Array.isArray(message.attachments)) return message.attachments; return Array.isArray(message.attachments?.data) ? message.attachments.data : []; }
  private hasAttachments(message: MetaMessage) { return this.attachmentList(message).length > 0; }
  private messageContent(message: MetaMessage) { if (message.message) return message.message; if (this.hasAttachments(message)) return "[Attachment]"; return "[Messenger message]"; }

  private async getOrCreateConversationByPsid(psid: string, lastMessage?: string, name?: string) {
    const customer = await this.customersService.findOrCreateByMessenger(psid, name || "Messenger Customer");
    const existing = await this.prisma.conversation.findFirst({ where: { customerId: customer.id, channel: "messenger" } });
    if (existing) { if (lastMessage !== undefined) return this.prisma.conversation.update({ where: { id: existing.id }, data: { lastMessage, updatedAt: new Date() } }); return existing; }
    return this.prisma.conversation.create({ data: { customerId: customer.id, channel: "messenger", lastMessage } });
  }

  async persistInbound(payload: { senderId: string; messageId?: string; text: string; rawPayload: unknown; type?: "text" | "attachment" }) {
    const profileName = await this.getMessengerProfileName(payload.senderId);
    const conversation = await this.getOrCreateConversationByPsid(payload.senderId, payload.text, profileName);
    if (payload.messageId) { const existing = await this.prisma.message.findFirst({ where: { metaMessageId: payload.messageId } }); if (existing) return existing; }
    const message = await this.prisma.message.create({ data: { conversationId: conversation.id, metaMessageId: payload.messageId, direction: "inbound", type: payload.type ?? "text", content: payload.text, rawPayload: payload.rawPayload as never } });
    this.notificationsService.notify("messenger.message_received", { conversationId: conversation.id, senderId: payload.senderId, messageId: payload.messageId, message: payload.text, createdAt: new Date().toISOString() });
    return message;
  }

  async sendText(recipientPsid: string, text: string) {
    const pageToken = await this.metaAuthService.getPageToken(); const endpoint = `https://graph.facebook.com/${this.graphVersion()}/me/messages`; const payload = { recipient: { id: recipientPsid }, messaging_type: "RESPONSE", message: { text } };
    if (!pageToken) { this.logger.warn("Meta Page authentication not configured; outbound send skipped"); return { skipped: true, payload }; }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    try { const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(pageToken)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal }); if (!response.ok) throw new Error(`Meta send failed: ${response.status}: ${await response.text()}`); const metaResult = await response.json() as { message_id?: string }; const conversation = await this.getOrCreateConversationByPsid(recipientPsid); const message = await this.prisma.message.create({ data: { conversationId: conversation.id, metaMessageId: metaResult.message_id, direction: "outbound", content: text } }); this.notificationsService.notify("messenger.message_sent", { conversationId: conversation.id, recipientPsid, messageId: message.id, metaMessageId: metaResult.message_id, message: text, createdAt: message.createdAt.toISOString() }); return metaResult; }
    finally { clearTimeout(timeout); }
  }

  listConversations() { return this.prisma.conversation.findMany({ where: { channel: "messenger" }, orderBy: { updatedAt: "desc" }, include: { customer: true }, take: 100 }); }
  getConversationMessages(conversationId: string) { return this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } }); }
}
