import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { MetaAuthService } from "./meta-auth.service";

interface MetaParticipant { id?: string; name?: string }
interface MetaAttachment { type?: string; payload?: { url?: string; sticker_id?: string; [key: string]: unknown }; [key: string]: unknown }
interface MetaMessage { id?: string; message?: string; created_time?: string; from?: MetaParticipant; to?: { data?: MetaParticipant[] }; attachments?: { data?: MetaAttachment[] } | MetaAttachment[]; tags?: unknown; is_echo?: boolean }
interface MetaConversation { id: string; updated_time?: string; participants?: { data?: MetaParticipant[] } }
interface MetaPage<T> { data?: T[]; paging?: { next?: string } }

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
    private readonly mcpOrdersService: McpOrdersService,
    private readonly metaAuthService: MetaAuthService
  ) {}

  async processIncoming(event: { senderId: string; messageId?: string; text: string; rawPayload: unknown }) {
    this.logger.log(`Messenger AI processing started: sender=${event.senderId} messageId=${event.messageId ?? "unknown"}`);
    const stored = await this.persistInbound(event);
    this.logger.log(`Messenger inbound persisted: sender=${event.senderId} messageId=${event.messageId ?? "unknown"} message=${stored.id}`);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id: stored.conversationId }, include: { customer: true } });
    const recentMessages = await this.prisma.message.findMany({ where: { conversationId: stored.conversationId, id: { not: stored.id } }, orderBy: { createdAt: "desc" }, take: 8, select: { direction: true, content: true, extractedOrder: true } });
    const contextMessages = recentMessages.slice().reverse().map((item) => `${item.direction === "inbound" ? "Customer" : "Assistant"}: ${item.content}`);
    const activeOrderMessage = recentMessages.find((item) => item.extractedOrder && typeof item.extractedOrder === "object" && !Array.isArray(item.extractedOrder));
    const activeOrderState = activeOrderMessage?.extractedOrder as Awaited<ReturnType<AiService["classifyAndExtract"]>>["details"] | undefined;
    const latestOrder = conversation.customer?.id
      ? await this.prisma.order.findFirst({
          where: { customerId: conversation.customer.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, orderNumber: true, status: true, createdAt: true, quantity: true, items: true }
        })
      : null;
    const orderValidation = activeOrderState ? this.describeOrderValidation(activeOrderState) : "No active order state is available.";
    const latestOrderContext = latestOrder
      ? `LATEST DATABASE ORDER: orderNumber=${latestOrder.orderNumber}; status=${latestOrder.status}; createdAt=${latestOrder.createdAt.toISOString()}. This is factual database state. Do not claim the current order was placed unless this latest order clearly matches the current order.`
      : "LATEST DATABASE ORDER: none found for this customer. Therefore no order has been created in the database yet.";
    contextMessages.push(`APPLICATION ORDER VALIDATION: ${orderValidation}`);
    contextMessages.push(latestOrderContext);

    this.logger.log(`Calling Qwen via Ollama: sender=${event.senderId} model=${this.config.get<string>("OLLAMA_MODEL", "qwen3:8b")}`);
    const ai = await this.aiService.classifyAndExtract(event.text, { customerName: conversation.customer?.name ?? undefined, recentMessages: contextMessages, activeOrderState });
    this.logger.log(`Qwen response received: sender=${event.senderId} intent=${ai.intent} confidence=${ai.confidence} confirmed=${Boolean(ai.details.confirmed)} missing=${JSON.stringify(ai.details.missingFields)}`);
    await this.prisma.message.update({ where: { id: stored.id }, data: { aiIntent: ai.intent, aiConfidence: ai.confidence, extractedOrder: ai.details as never, processedAt: new Date() } });

    let reply = ai.suggestedReply?.trim() ?? "";
    if (this.isConfirmedOrder(ai, event.text)) {
      try {
        const created = await this.createConfirmedOrder(ai, conversation.customer?.name || "Messenger Customer", event.text);
        this.notificationsService.notify("order.created_from_messenger", { conversationId: conversation.id, senderId: event.senderId, orderId: created.id, orderNumber: created.orderNumber });
        this.logger.log(`Created confirmed Messenger order ${created.orderNumber} for ${event.senderId} via MCP order service`);
        reply = await this.aiService.generateOrderResultReply("created", created.orderNumber);
      } catch (error) {
        this.logger.error(`Confirmed Messenger order could not be created for ${event.senderId}`, error instanceof Error ? error.stack : String(error));
        try {
          reply = await this.aiService.generateOrderResultReply("failed");
        } catch (replyError) {
          this.logger.error(`Qwen order-result reply generation failed for ${event.senderId}`, replyError instanceof Error ? replyError.stack : String(replyError));
          reply = ai.suggestedReply?.trim() ?? "";
        }
      }
    }

    if (reply) {
      this.logger.log(`Sending Qwen Messenger reply: sender=${event.senderId}`);
      try { await this.sendText(event.senderId, reply); this.logger.log(`Qwen Messenger reply sent: sender=${event.senderId}`); }
      catch (error) { this.logger.error(`Failed to send Qwen Messenger reply to ${event.senderId}`, error instanceof Error ? error.stack : String(error)); }
    }
    return { ai, reply };
  }

  private describeOrderValidation(details: Awaited<ReturnType<AiService["classifyAndExtract"]>>["details"]) {
    const missing = Array.isArray(details.missingFields) ? details.missingFields : [];
    if (missing.length === 0 && details.flavors.length > 0) {
      return "READY for MCP placement only if the current customer message is an explicit confirmation. The application has all required order fields.";
    }
    return `NOT READY for MCP placement. Missing required fields: ${missing.length ? missing.join(", ") : "order details"}. A customer confirmation must not be described as an order being placed.`;
  }

  private isConfirmedOrder(ai: Awaited<ReturnType<AiService["classifyAndExtract"]>>, currentMessage: string) {
    const details = ai.details;
    const quantity = Number(details.quantity ?? 0);
    const flavors = details.flavors ?? [];
    const flavorQuantity = flavors.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const explicitConfirmation = /\b(yes|yeah|yep|correct|confirmed|confirm|go ahead|proceed|place my order|place the order|order it|that's correct|that is correct|okay proceed)\b/i.test(currentMessage.trim());
    const deliveryComplete = details.deliveryMethod === "pickup" || (details.deliveryMethod === "maxim" && Boolean(details.address?.trim() && details.landmark?.trim() && details.contactNumber?.trim()));
    const requiredFieldsPresent = flavors.length > 0 && flavorQuantity === quantity && quantity >= 10 && Boolean(details.deliveryMethod && details.paymentMethod) && deliveryComplete;
    this.logger.log(`Messenger confirmation gate: explicit=${explicitConfirmation} requiredFields=${requiredFieldsPresent} missing=${JSON.stringify(details.missingFields)} quantity=${quantity} flavorQuantity=${flavorQuantity} delivery=${details.deliveryMethod ?? "none"} payment=${details.paymentMethod ?? "none"}`);
    return explicitConfirmation && requiredFieldsPresent && details.missingFields.length === 0;
  }

  private async createConfirmedOrder(ai: Awaited<ReturnType<AiService["classifyAndExtract"]>>, customerName: string, originalMessage: string) {
    const details = ai.details;
    const flavors = details.flavors ?? [];
    return this.mcpOrdersService.createOrder({
      customerName,
      phoneNumber: details.contactNumber,
      quantity: Number(details.quantity),
      deliveryMethod: details.deliveryMethod,
      paymentMethod: details.paymentMethod,
      location: details.landmark,
      address: details.address,
      preferredSchedule: this.toManilaIso(details.deliveryDate, details.preferredTime),
      items: flavors.map((item) => ({ name: item.name, quantity: item.quantity, price: item.unitPrice, subtotal: item.subtotal })),
      notes: `Confirmed via Messenger. Original confirmation: ${originalMessage}`
    });
  }

  private toManilaIso(date?: string, time?: string) {
    if (!date || !time) return undefined;
    if (/^\d{4}-\d{2}-\d{2}T/.test(time)) return new Date(time).toISOString();
    const match = time.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return undefined;
    let hour = Number(match[1]); const minute = Number(match[2]); const meridiem = match[3]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return undefined;
    return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`).toISOString();
  }

  async handleStandbyEvent(event: { senderId: string; messageId?: string; text?: string; rawPayload: unknown }) {
    const text = event.text;
    if (text) await this.persistInbound({ senderId: event.senderId, messageId: event.messageId, text, rawPayload: event.rawPayload });
    const autoRequest = this.config.get<string>("META_AUTO_REQUEST_THREAD_CONTROL")?.toLowerCase() === "true";
    if (!autoRequest) return { action: "observed" as const };
    const result = await this.requestThreadControl(event.senderId, "Empanada Hauz backend requests control after receiving a standby message");
    return { action: result ? "thread_control_requested" as const : "thread_control_request_failed" as const };
  }

  verify(mode?: string, token?: string, challenge?: string) { if (mode === "subscribe" && token === this.config.get<string>("META_VERIFY_TOKEN")) return challenge ?? ""; return null; }
  private graphVersion() { return this.config.get<string>("META_GRAPH_API_VERSION") ?? "v26.0"; }
  private pageId() { return this.config.get<string>("META_PAGE_ID") ?? ""; }

  private async getMessengerProfileName(psid: string) {
    try {
      const profile = await this.metaGet<{ name?: string; first_name?: string; last_name?: string }>(`https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}?fields=name,first_name,last_name`);
      const name = profile.name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
      return name || undefined;
    } catch (err) {
      this.logger.warn(`Unable to fetch Messenger profile name for ${psid}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  private async metaGet<T>(url: string): Promise<T> {
    const token = await this.metaAuthService.getPageToken();
    if (!token) throw new Error("Meta Page authentication is not configured. Reconnect Meta first.");
    const requestUrl = new URL(url); requestUrl.searchParams.set("access_token", token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(requestUrl, { headers: { accept: "application/json" }, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) throw new Error(`Meta Graph API failed: ${response.status} ${body}`);
      return JSON.parse(body) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async metaPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const token = await this.metaAuthService.getPageToken();
    if (!token) throw new Error("Meta Page authentication is not configured. Reconnect Meta first.");
    const endpoint = `https://graph.facebook.com/${this.graphVersion()}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`Meta Graph API POST failed: ${response.status} ${responseBody}`);
      return JSON.parse(responseBody) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestThreadControl(psid: string, metadata?: string) {
    this.logger.warn(`Requesting Messenger thread control: psid=${psid}`);
    try {
      const result = await this.metaPost<{ success?: boolean }>("/me/request_thread_control", { recipient: { id: psid }, ...(metadata ? { metadata } : {}) });
      this.logger.log(`Messenger thread control request result: psid=${psid} success=${Boolean(result.success)}`);
      return Boolean(result.success);
    } catch (err) {
      this.logger.error(`Messenger thread control request failed: psid=${psid}`, err instanceof Error ? err.message : String(err));
      return false;
    }
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
        if (conversationsSeen >= maxConversations) break; conversationsSeen += 1;
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
            if (conversationMessageCount >= maxMessagesPerConversation || !metaMessage.id) break; conversationMessageCount += 1;
            if (!newestMessage || this.messageTime(metaMessage) > this.messageTime(newestMessage)) newestMessage = metaMessage;
            const existing = await this.prisma.message.findFirst({ where: { metaMessageId: metaMessage.id } });
            if (existing) continue;
            const direction = metaMessage.from?.id === participant.id ? "inbound" : "outbound";
            const text = this.extractMetaMessageText(metaMessage);
            if (!text) continue;
            await this.prisma.message.create({ data: { conversationId: conversation.id, metaMessageId: metaMessage.id, direction, content: text, ...(metaMessage.created_time ? { createdAt: new Date(metaMessage.created_time) } : {}) } });
            messagesImported += 1;
          }
          messageUrl = messagesPage.paging?.next;
        }
      }
      nextUrl = page.paging?.next;
    }
    return { conversationsSeen, conversationsImported, messagesImported };
  }

  private findCustomerParticipant(participants: MetaParticipant[], pageId: string) {
    return participants.find((participant) => participant.id && participant.id !== pageId);
  }

  private messageTime(message: MetaMessage) {
    return message.created_time ? new Date(message.created_time).getTime() : 0;
  }

  private extractMetaMessageText(message: MetaMessage) {
    return typeof message.message === "string" ? message.message.trim() : "";
  }

  private async persistInbound(event: { senderId: string; messageId?: string; text: string; rawPayload: unknown }) {
    let conversation = await this.prisma.conversation.findFirst({ where: { metaSenderId: event.senderId } });
    if (!conversation) {
      const profileName = await this.getMessengerProfileName(event.senderId);
      const customer = await this.customersService.findOrCreateByMessenger(event.senderId, profileName || "Messenger Customer");
      conversation = await this.prisma.conversation.create({ data: { customerId: customer.id, channel: "messenger", metaSenderId: event.senderId } });
    }
    const message = await this.prisma.message.create({ data: { conversationId: conversation.id, direction: "inbound", content: event.text, metaMessageId: event.messageId, rawPayload: event.rawPayload as never } });
    return message;
  }

  private async sendText(recipientId: string, text: string) {
    return this.metaPost(`/me/messages`, { recipient: { id: recipientId }, message: { text } });
  }
}