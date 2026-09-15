import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiControlService } from "../ai/ai-control.service";
import { AiRuntimeService } from "../ai/ai-runtime.service";
import { NotificationsService } from "../notifications/notifications.service";
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
    private readonly aiControl: AiControlService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly notificationsService: NotificationsService,
    private readonly metaAuthService: MetaAuthService
  ) {}

  async processIncoming(event: { senderId: string; messageId?: string; text: string; rawPayload: unknown }) {
    this.logger.log(`Messenger AI runtime started: sender=${event.senderId} messageId=${event.messageId ?? "unknown"}`);
    const stored = await this.persistInbound(event);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id: stored.conversationId }, include: { customer: true } });
    const aiState = await this.aiControl.getCustomerState(conversation.customer.id);
    if (!aiState.effectiveEnabled) return { ai: null, reply: "", aiEnabled: false };

    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId: stored.conversationId, id: { not: stored.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { direction: true, content: true }
    });
    const runtime = await this.aiRuntime.process({
      customerId: conversation.customer.id,
      conversationId: conversation.id,
      channel: "messenger",
      customerName: conversation.customer?.name ?? undefined,
      message: event.text,
      recentMessages: recentMessages.slice().reverse().map((item) => `${item.direction === "inbound" ? "Customer" : "Assistant"}: ${item.content}`)
    });

    if (runtime.tool === "create_order" && runtime.toolResult && typeof runtime.toolResult === "object") {
      const created = runtime.toolResult as { id?: string; orderNumber?: string };
      if (created.id && created.orderNumber) {
        this.notificationsService.notify("order.created_from_messenger", { conversationId: conversation.id, senderId: event.senderId, orderId: created.id, orderNumber: created.orderNumber });
        this.logger.log(`Created Messenger order ${created.orderNumber} through AI runtime tool execution`);
      }
    }

    const reply = runtime.reply?.trim() ?? "";
    if (reply) {
      try { await this.sendText(event.senderId, reply); }
      catch (error) { this.logger.error(`Failed to send Messenger AI runtime reply to ${event.senderId}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { ai: { tool: runtime.tool, state: runtime.state }, reply, aiEnabled: true };
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

  async getMessengerProfileName(psid: string) {
    try {
      const profile = await this.metaGet<{ name?: string; first_name?: string; last_name?: string }>(`https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(psid)}?fields=name,first_name,last_name`);
      return profile.name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || undefined;
    } catch (err) {
      this.logger.warn(`Unable to fetch Messenger profile name for ${psid}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  private async metaGet<T>(url: string): Promise<T> {
    const token = await this.metaAuthService.getPageToken();
    if (!token) throw new Error("Meta Page authentication is not configured. Reconnect Meta first.");
    const requestUrl = new URL(url); requestUrl.searchParams.set("access_token", token);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.metaFetch(requestUrl, { headers: { accept: "application/json" }, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) throw new Error(`Meta Graph API failed: ${response.status} ${body}`);
      return JSON.parse(body) as T;
    } finally { clearTimeout(timeout); }
  }

  private async metaPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const token = await this.metaAuthService.getPageToken();
    if (!token) throw new Error("Meta Page authentication is not configured. Reconnect Meta first.");
    const endpoint = `https://graph.facebook.com/${this.graphVersion()}${path}`;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.metaFetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`Meta Graph API POST failed: ${response.status} ${responseBody}`);
      return JSON.parse(responseBody) as T;
    } finally { clearTimeout(timeout); }
  }

  async requestThreadControl(psid: string, metadata?: string) {
    try {
      const result = await this.metaPost<{ success?: boolean }>("/me/request_thread_control", { recipient: { id: psid }, ...(metadata ? { metadata } : {}) });
      return Boolean(result.success);
    } catch (err) {
      this.logger.error(`Messenger thread control request failed: psid=${psid}`, err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async syncFromMeta(options: { maxConversations?: number; maxMessagesPerConversation?: number } = {}) {
    await this.metaAuthService.ensureAuthenticated();
    const maxConversations = Math.max(1, options.maxConversations ?? 100);
    const maxMessagesPerConversation = Math.max(1, options.maxMessagesPerConversation ?? 1000);
    const pageId = this.pageId(); if (!pageId) throw new Error("META_PAGE_ID is not configured");
    let nextUrl: string | undefined = `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}/conversations?fields=id,participants,updated_time&limit=100`;
    let conversationsSeen = 0, conversationsImported = 0, messagesImported = 0;
    while (nextUrl && conversationsSeen < maxConversations) {
      const page: MetaPage<MetaConversation> = await this.metaGet<MetaPage<MetaConversation>>(nextUrl);
      for (const metaConversation of page.data ?? []) {
        if (conversationsSeen >= maxConversations) break;
        conversationsSeen += 1;
        const participant = this.findCustomerParticipant(metaConversation.participants?.data ?? [], pageId);
        if (!participant?.id) continue;
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
            if (existing) await this.prisma.message.update({ where: { id: existing.id }, data }); else await this.prisma.message.create({ data });
            messagesImported += existing ? 0 : 1;
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
    if (existing) {
      if (lastMessage !== undefined) return this.prisma.conversation.update({ where: { id: existing.id }, data: { lastMessage, updatedAt: new Date() } });
      return existing;
    }
    return this.prisma.conversation.create({ data: { customerId: customer.id, channel: "messenger", lastMessage } });
  }

  private async emitRealtimeMessage(conversationId: string, messageId: string, type: "messenger.message_received" | "messenger.message_sent") {
    const [conversation, messageRecord] = await Promise.all([
      this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { customer: true } }),
      this.prisma.message.findUnique({ where: { id: messageId } })
    ]);
    if (!conversation || !messageRecord) return;
    this.notificationsService.notify(type, {
      conversationId,
      conversation,
      messageRecord,
      messageId: messageRecord.id,
      message: messageRecord.content,
      createdAt: messageRecord.createdAt.toISOString()
    });
  }

  async persistInbound(payload: { senderId: string; messageId?: string; text: string; rawPayload: unknown; type?: "text" | "attachment" }) {
    const profileName = await this.getMessengerProfileName(payload.senderId);
    const conversation = await this.getOrCreateConversationByPsid(payload.senderId, payload.text, profileName);
    if (payload.messageId) {
      const existing = await this.prisma.message.findFirst({ where: { metaMessageId: payload.messageId } });
      if (existing) return existing;
    }
    const message = await this.prisma.message.create({ data: { conversationId: conversation.id, metaMessageId: payload.messageId, direction: "inbound", type: payload.type ?? "text", content: payload.text, rawPayload: payload.rawPayload as never } });
    await this.emitRealtimeMessage(conversation.id, message.id, "messenger.message_received");
    return message;
  }

  async sendText(recipientPsid: string, text: string) {
    const pageToken = await this.metaAuthService.getPageToken();
    const endpoint = `https://graph.facebook.com/${this.graphVersion()}/me/messages`;
    const payload = { recipient: { id: recipientPsid }, messaging_type: "RESPONSE", message: { text } };
    if (!pageToken) return { skipped: true, payload };
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.metaFetch(`${endpoint}?access_token=${encodeURIComponent(pageToken)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) throw new Error(`Meta send failed: ${response.status}: ${await response.text()}`);
      const metaResult = await response.json() as { message_id?: string };
      const conversation = await this.getOrCreateConversationByPsid(recipientPsid, text);
      const message = await this.prisma.message.create({ data: { conversationId: conversation.id, metaMessageId: metaResult.message_id, direction: "outbound", content: text } });
      await this.emitRealtimeMessage(conversation.id, message.id, "messenger.message_sent");
      return metaResult;
    } finally { clearTimeout(timeout); }
  }

  listConversations(search?: string) {
    const normalized = search?.trim();
    return this.prisma.conversation.findMany({
      where: {
        channel: "messenger",
        ...(normalized ? { customer: { OR: [{ name: { contains: normalized, mode: "insensitive" } }, { messengerPsid: { contains: normalized, mode: "insensitive" } }] } } : {})
      },
      orderBy: { updatedAt: "desc" },
      include: { customer: true },
      take: 100
    });
  }

  async searchMessages(query: string) {
    const normalized = query?.trim();
    if (!normalized) return [];
    return this.prisma.message.findMany({
      where: {
        conversation: { channel: "messenger" },
        content: { contains: normalized, mode: "insensitive" }
      },
      orderBy: { createdAt: "desc" },
      include: { conversation: { include: { customer: true } } },
      take: 100
    });
  }

  getConversationMessages(conversationId: string) { return this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } }); }

  private async metaFetch(url: string | URL, options: RequestInit) {
    try {
      return await fetch(url, options);
    } catch {
      throw new ServiceUnavailableException("Meta Graph API is unavailable. Check the internet connection and try again.");
    }
  }
}
