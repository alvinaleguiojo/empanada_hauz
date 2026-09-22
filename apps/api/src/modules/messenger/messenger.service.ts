import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
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
        const ensured = await this.ensureMessengerContact(
          participant.id,
          participant.name || "Messenger Customer",
          metaConversation.id
        );
        const customer = ensured.customer;
        let conversation = ensured.conversation;
        if (metaConversation.updated_time) {
          conversation = await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date(metaConversation.updated_time) }
          });
        }
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
    const ensured = await this.ensureMessengerContact(psid, name || "Messenger Customer");
    if (lastMessage !== undefined) {
      return this.prisma.conversation.update({
        where: { id: ensured.conversation.id },
        data: { lastMessage, updatedAt: new Date() }
      });
    }
    return ensured.conversation;
  }

  private isPlaceholderCustomerName(name?: string | null) {
    return !name || name.trim() === "" || name.trim() === "Messenger Customer";
  }

  private pickCanonicalCustomer<
    T extends {
      id: string;
      name: string;
      totalOrders: number;
      totalSpent: number;
      updatedAt: Date;
    }
  >(customers: T[]) {
    return [...customers].sort((a, b) => {
      const score = (customer: T) =>
        (this.isPlaceholderCustomerName(customer.name) ? 0 : 1) * 1_000_000 +
        customer.totalOrders * 1_000 +
        customer.totalSpent;
      return score(b) - score(a) || b.updatedAt.getTime() - a.updatedAt.getTime();
    })[0];
  }

  private pickCanonicalConversation(
    conversations: Array<{
      id: string;
      metaConversationId: string | null;
      updatedAt: Date;
      lastMessage: string | null;
    }>,
    preferredMetaConversationId?: string
  ) {
    if (!conversations.length) return undefined;
    return [...conversations].sort((a, b) => {
      const aPreferred = preferredMetaConversationId && a.metaConversationId === preferredMetaConversationId ? 1 : 0;
      const bPreferred = preferredMetaConversationId && b.metaConversationId === preferredMetaConversationId ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      const aHasMeta = a.metaConversationId ? 1 : 0;
      const bHasMeta = b.metaConversationId ? 1 : 0;
      if (aHasMeta !== bHasMeta) return bHasMeta - aHasMeta;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })[0];
  }

  private async mergeConversationInto(
    tx: Prisma.TransactionClient,
    sourceConversationId: string,
    targetConversationId: string,
    targetUpdatedAt: Date,
    source: { updatedAt: Date; lastMessage: string | null; metaConversationId: string | null }
  ) {
    if (sourceConversationId === targetConversationId) return targetUpdatedAt;

    await tx.message.updateMany({
      where: { conversationId: sourceConversationId },
      data: { conversationId: targetConversationId }
    });

    await tx.order.updateMany({
      where: { conversationId: sourceConversationId },
      data: { conversationId: targetConversationId }
    });

    await tx.conversation.delete({ where: { id: sourceConversationId } });

    if (source.updatedAt.getTime() > targetUpdatedAt.getTime()) {
      return source.updatedAt;
    }
    return targetUpdatedAt;
  }

  private async mergeCustomerInto(
    tx: Prisma.TransactionClient,
    sourceCustomerId: string,
    targetCustomerId: string
  ) {
    if (sourceCustomerId === targetCustomerId) return;

    const sourceCustomer = await tx.customer.findUnique({
      where: { id: sourceCustomerId }
    });
    const targetCustomer = await tx.customer.findUnique({
      where: { id: targetCustomerId }
    });
    if (!sourceCustomer || !targetCustomer) return;

    await tx.order.updateMany({
      where: { customerId: sourceCustomerId },
      data: { customerId: targetCustomerId }
    });

    await tx.conversation.updateMany({
      where: { customerId: sourceCustomerId, channel: "messenger" },
      data: { customerId: targetCustomerId }
    });

    const nextName = this.isPlaceholderCustomerName(targetCustomer.name) && !this.isPlaceholderCustomerName(sourceCustomer.name)
      ? sourceCustomer.name
      : targetCustomer.name;
    const nextPhone = targetCustomer.phoneNumber || sourceCustomer.phoneNumber;
    const nextAddress = targetCustomer.defaultAddress || sourceCustomer.defaultAddress;

    await tx.customer.update({
      where: { id: targetCustomerId },
      data: {
        ...(nextName !== targetCustomer.name ? { name: nextName } : {}),
        ...(nextPhone !== targetCustomer.phoneNumber ? { phoneNumber: nextPhone } : {}),
        ...(nextAddress !== targetCustomer.defaultAddress ? { defaultAddress: nextAddress } : {})
      }
    });

    await tx.customer.delete({ where: { id: sourceCustomerId } });
  }

  private async mergeDuplicateMessengerConversations(
    tx: Prisma.TransactionClient,
    customerId: string,
    preferredMetaConversationId?: string
  ) {
    const conversations = await tx.conversation.findMany({
      where: { customerId, channel: "messenger" },
      orderBy: { updatedAt: "desc" }
    });

    const canonical = this.pickCanonicalConversation(conversations, preferredMetaConversationId);
    if (!canonical) return undefined;

    let latestUpdatedAt = canonical.updatedAt;
    let latestLastMessage = canonical.lastMessage;
    let metaConversationId = canonical.metaConversationId;

    for (const conversation of conversations) {
      if (conversation.id === canonical.id) continue;
      latestUpdatedAt = await this.mergeConversationInto(
        tx,
        conversation.id,
        canonical.id,
        latestUpdatedAt,
        conversation
      );
      if (conversation.updatedAt.getTime() > (canonical.updatedAt?.getTime() ?? 0)) {
        latestLastMessage = conversation.lastMessage;
      }
      if (!metaConversationId && conversation.metaConversationId) {
        metaConversationId = conversation.metaConversationId;
      }
    }

    const data: Prisma.ConversationUpdateInput = {
      updatedAt: latestUpdatedAt,
      ...(latestLastMessage !== undefined ? { lastMessage: latestLastMessage } : {}),
      ...(preferredMetaConversationId
        ? { metaConversationId: preferredMetaConversationId }
        : metaConversationId
          ? { metaConversationId }
          : {})
    };

    return tx.conversation.update({
      where: { id: canonical.id },
      data
    });
  }

  private async ensureMessengerContact(
    psid: string,
    name?: string,
    metaConversationId?: string
  ) {
    const normalizedPsid = psid.trim();
    if (!normalizedPsid) throw new Error("Messenger PSID is required.");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.messengerContact.findUnique({
            where: { psid: normalizedPsid },
            include: { customer: true, conversation: true }
          });

          if (existing) {
            const realName = name?.trim();
            const updatedCustomer = realName && !this.isPlaceholderCustomerName(realName) && this.isPlaceholderCustomerName(existing.customer.name)
              ? await tx.customer.update({
                  where: { id: existing.customer.id },
                  data: { name: realName }
                })
              : existing.customer;

            const updatedContact = metaConversationId && existing.metaConversationId !== metaConversationId
              ? await tx.messengerContact.update({
                  where: { id: existing.id },
                  data: { metaConversationId }
                })
              : existing;

            const refreshedConversation = await tx.conversation.findUnique({
              where: { id: updatedContact.conversationId }
            });
            if (!refreshedConversation) {
              throw new Error(`Messenger contact ${normalizedPsid} points to a missing conversation.`);
            }

            return {
              customer: updatedCustomer,
              conversation: refreshedConversation
            };
          }

          const legacyCustomers = await tx.customer.findMany({
            where: { messengerPsid: normalizedPsid },
            orderBy: { updatedAt: "desc" },
            take: 20
          });

          let customer = this.pickCanonicalCustomer(legacyCustomers);
          if (!customer) {
            customer = await tx.customer.create({
              data: {
                messengerPsid: normalizedPsid,
                name: name?.trim() || "Messenger Customer"
              }
            });
          } else {
            const realName = name?.trim();
            if (realName && !this.isPlaceholderCustomerName(realName) && this.isPlaceholderCustomerName(customer.name)) {
              customer = await tx.customer.update({
                where: { id: customer.id },
                data: { name: realName }
              });
            }
          }

          for (const duplicateCustomer of legacyCustomers) {
            if (duplicateCustomer.id !== customer.id) {
              await this.mergeCustomerInto(tx, duplicateCustomer.id, customer.id);
            }
          }

          let conversation = await this.mergeDuplicateMessengerConversations(
            tx,
            customer.id,
            metaConversationId
          );

          if (!conversation) {
            conversation = await tx.conversation.create({
              data: {
                customerId: customer.id,
                channel: "messenger",
                ...(metaConversationId ? { metaConversationId } : {})
              }
            });
          } else if (metaConversationId && conversation.metaConversationId !== metaConversationId) {
            conversation = await tx.conversation.update({
              where: { id: conversation.id },
              data: { metaConversationId }
            });
          }

          try {
            await tx.messengerContact.create({
              data: {
                psid: normalizedPsid,
                customerId: customer.id,
                conversationId: conversation.id,
                ...(metaConversationId ? { metaConversationId } : {})
              }
            });
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
              throw error;
            }
            const raced = await tx.messengerContact.findUnique({
              where: { psid: normalizedPsid }
            });
            if (!raced) throw error;
            const racedCustomer = await tx.customer.findUniqueOrThrow({ where: { id: raced.customerId } });
            const racedConversation = await tx.conversation.findUniqueOrThrow({ where: { id: raced.conversationId } });
            return { customer: racedCustomer, conversation: racedConversation };
          }

          return { customer, conversation };
        });
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034");

        if (!retryable) throw error;

        const raced = await this.prisma.messengerContact.findUnique({
          where: { psid: normalizedPsid }
        });
        if (raced) {
          const [customer, conversation] = await Promise.all([
            this.prisma.customer.findUniqueOrThrow({ where: { id: raced.customerId } }),
            this.prisma.conversation.findUniqueOrThrow({ where: { id: raced.conversationId } })
          ]);
          return { customer, conversation };
        }

        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }

    throw new ServiceUnavailableException("Messenger conversation is being initialized. Please retry.");
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
    if (payload.messageId) {
      const existing = await this.prisma.message.findFirst({ where: { metaMessageId: payload.messageId } });
      if (existing) return existing;
    }

    const profileName = await this.getMessengerProfileName(payload.senderId);
    const ensured = await this.ensureMessengerContact(payload.senderId, profileName);

    const message = await this.prisma.message.create({
      data: {
        conversationId: ensured.conversation.id,
        metaMessageId: payload.messageId,
        direction: "inbound",
        type: payload.type ?? "text",
        content: payload.text,
        rawPayload: payload.rawPayload as never
      }
    });

    await this.prisma.conversation.update({
      where: { id: ensured.conversation.id },
      data: { lastMessage: payload.text, updatedAt: new Date() }
    });

    await this.emitRealtimeMessage(ensured.conversation.id, message.id, "messenger.message_received");
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
      const ensured = await this.ensureMessengerContact(recipientPsid);
      const message = await this.prisma.message.create({
        data: {
          conversationId: ensured.conversation.id,
          metaMessageId: metaResult.message_id,
          direction: "outbound",
          content: text
        }
      });
      await this.prisma.conversation.update({
        where: { id: ensured.conversation.id },
        data: { lastMessage: text, updatedAt: new Date() }
      });
      await this.emitRealtimeMessage(ensured.conversation.id, message.id, "messenger.message_sent");
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
