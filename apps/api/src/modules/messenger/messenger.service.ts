import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiService } from "../ai/ai.service";
import { OrdersService } from "../orders/orders.service";
import { NotificationsService } from "../notifications/notifications.service";

interface MetaParticipant { id?: string; name?: string }
interface MetaMessage {
  id?: string;
  message?: string;
  created_time?: string;
  from?: MetaParticipant;
  to?: { data?: MetaParticipant[] };
  attachments?: unknown;
  tags?: unknown;
}
interface MetaConversation {
  id: string;
  updated_time?: string;
  participants?: { data?: MetaParticipant[] };
}
interface MetaPage<T> { data?: T[]; paging?: { next?: string } }

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly aiService: AiService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService
  ) {}

  async processIncoming(event: { senderId: string; messageId?: string; text: string; rawPayload: unknown }) {
    const stored = await this.persistInbound(event);
    const ai = await this.aiService.classifyAndExtract(event.text);
    await this.prisma.message.update({
      where: { id: stored.id },
      data: { aiIntent: ai.intent, aiConfidence: ai.confidence, extractedOrder: ai.details as never, processedAt: new Date() }
    });

    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id: stored.conversationId } });
    if (ai.details.quantity && ai.details.deliveryMethod && ai.details.missingFields.length === 0) {
      await this.ordersService.createManual({
        customerName: `Messenger ${event.senderId}`,
        quantity: ai.details.quantity,
        unitPrice: 20,
        deliveryFee: 0,
        deliveryMethod: ai.details.deliveryMethod,
        paymentMethod: "cod",
        address: ai.details.deliveryMethod === "maxim" ? ai.details.location : undefined,
        location: ai.details.location,
        preferredSchedule: ai.details.preferredTime,
        notes: event.text
      });
      this.notificationsService.notify("order.created_from_messenger", { conversationId: conversation.id, senderId: event.senderId });
    }
    await this.sendText(event.senderId, ai.suggestedReply);
  }

  verify(mode?: string, token?: string, challenge?: string) {
    if (mode === "subscribe" && token === this.config.get<string>("META_VERIFY_TOKEN")) return challenge ?? "";
    return null;
  }

  private graphVersion() { return this.config.get<string>("META_GRAPH_API_VERSION") ?? "v26.0"; }
  private pageId() { return this.config.get<string>("META_PAGE_ID") ?? ""; }
  private pageToken() { return this.config.get<string>("META_PAGE_ACCESS_TOKEN") ?? ""; }

  private async metaGet<T>(url: string): Promise<T> {
    const token = this.pageToken();
    if (!token) throw new Error("META_PAGE_ACCESS_TOKEN is not configured");
    const requestUrl = new URL(url);
    requestUrl.searchParams.set("access_token", token);
    const response = await fetch(requestUrl, { headers: { accept: "application/json" } });
    const body = await response.text();
    if (!response.ok) throw new Error(`Meta Graph API failed: ${response.status} ${body}`);
    return JSON.parse(body) as T;
  }

  /** Import existing Messenger history without triggering AI/order automation. */
  async syncFromMeta(options: { maxConversations?: number; maxMessagesPerConversation?: number } = {}) {
    const maxConversations = Math.max(1, options.maxConversations ?? 100);
    const maxMessagesPerConversation = Math.max(1, options.maxMessagesPerConversation ?? 1000);
    const pageId = this.pageId();
    if (!pageId) throw new Error("META_PAGE_ID is not configured");

    let nextUrl: string | undefined = `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(pageId)}/conversations?fields=id,participants,updated_time&limit=100`;
    let conversationsSeen = 0;
    let conversationsImported = 0;
    let messagesImported = 0;

    while (nextUrl && conversationsSeen < maxConversations) {
      const page: MetaPage<MetaConversation> = await this.metaGet<MetaPage<MetaConversation>>(nextUrl);
      for (const metaConversation of page.data ?? []) {
        if (conversationsSeen >= maxConversations) break;
        conversationsSeen += 1;

        const participant = this.findCustomerParticipant(metaConversation.participants?.data ?? [], pageId);
        if (!participant?.id) {
          this.logger.warn(`Skipping Meta conversation ${metaConversation.id}: no customer participant found`);
          continue;
        }

        const customer = await this.customersService.findOrCreateByMessenger(participant.id, participant.name || "Messenger Customer");
        let conversation = await this.prisma.conversation.findFirst({ where: { metaConversationId: metaConversation.id } });

        if (!conversation) {
          conversation = await this.prisma.conversation.create({
            data: {
              customerId: customer.id,
              channel: "messenger",
              metaConversationId: metaConversation.id,
              ...(metaConversation.updated_time ? { updatedAt: new Date(metaConversation.updated_time) } : {})
            }
          });
        } else {
          conversation = await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              customerId: customer.id,
              channel: "messenger",
              ...(metaConversation.updated_time ? { updatedAt: new Date(metaConversation.updated_time) } : {})
            }
          });
        }
        conversationsImported += 1;

        let messageUrl: string | undefined = `https://graph.facebook.com/${this.graphVersion()}/${encodeURIComponent(metaConversation.id)}/messages?fields=id,message,created_time,from,to,attachments,tags&limit=100`;
        let conversationMessageCount = 0;
        let newestMessage: MetaMessage | undefined;

        while (messageUrl && conversationMessageCount < maxMessagesPerConversation) {
          const messagesPage: MetaPage<MetaMessage> = await this.metaGet<MetaPage<MetaMessage>>(messageUrl);
          for (const metaMessage of messagesPage.data ?? []) {
            if (conversationMessageCount >= maxMessagesPerConversation || !metaMessage.id) break;
            conversationMessageCount += 1;
            if (!newestMessage || this.messageTime(metaMessage) > this.messageTime(newestMessage)) newestMessage = metaMessage;

            const existing = await this.prisma.message.findFirst({ where: { metaMessageId: metaMessage.id } });
            const data = {
              conversationId: conversation.id,
              metaMessageId: metaMessage.id,
              direction: (metaMessage.from?.id === pageId ? "outbound" : "inbound") as "outbound" | "inbound",
              type: (metaMessage.attachments ? "attachment" : "text") as "attachment" | "text",
              content: this.messageContent(metaMessage),
              rawPayload: metaMessage as never,
              ...(metaMessage.created_time ? { createdAt: new Date(metaMessage.created_time) } : {})
            };

            if (existing) await this.prisma.message.update({ where: { id: existing.id }, data });
            else await this.prisma.message.create({ data });
            messagesImported += 1;
          }
          if (conversationMessageCount >= maxMessagesPerConversation) break;
          messageUrl = messagesPage.paging?.next;
        }

        if (newestMessage) {
          await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessage: this.messageContent(newestMessage),
              ...(newestMessage.created_time ? { updatedAt: new Date(newestMessage.created_time) } : {})
            }
          });
        }
      }
      nextUrl = page.paging?.next;
    }

    return { conversationsSeen, conversationsImported, messagesImported, maxConversations, maxMessagesPerConversation };
  }

  private findCustomerParticipant(participants: MetaParticipant[], pageId: string) {
    return participants.find((participant) => participant.id && participant.id !== pageId);
  }

  private messageTime(message: MetaMessage) { return message.created_time ? Date.parse(message.created_time) : 0; }
  private messageContent(message: MetaMessage) {
    if (message.message) return message.message;
    if (message.attachments) return "[Attachment]";
    return "[Messenger message]";
  }

  private async getOrCreateConversationByPsid(psid: string, lastMessage?: string) {
    const customer = await this.customersService.findOrCreateByMessenger(psid);
    const existing = await this.prisma.conversation.findFirst({ where: { customerId: customer.id, channel: "messenger" } });
    if (existing) {
      if (lastMessage !== undefined) return this.prisma.conversation.update({ where: { id: existing.id }, data: { lastMessage, updatedAt: new Date() } });
      return existing;
    }
    return this.prisma.conversation.create({ data: { customerId: customer.id, channel: "messenger", lastMessage } });
  }

  async persistInbound(payload: { senderId: string; messageId?: string; text: string; rawPayload: unknown }) {
    const conversation = await this.getOrCreateConversationByPsid(payload.senderId, payload.text);
    if (payload.messageId) {
      const existing = await this.prisma.message.findFirst({ where: { metaMessageId: payload.messageId } });
      if (existing) return existing;
    }
    return this.prisma.message.create({ data: { conversationId: conversation.id, metaMessageId: payload.messageId, direction: "inbound", content: payload.text, rawPayload: payload.rawPayload as never } });
  }

  async sendText(recipientPsid: string, text: string) {
    const pageToken = this.pageToken();
    const endpoint = `https://graph.facebook.com/${this.graphVersion()}/me/messages`;
    const payload = { recipient: { id: recipientPsid }, messaging_type: "RESPONSE", message: { text } };
    if (!pageToken) {
      this.logger.warn("META_PAGE_ACCESS_TOKEN not configured; outbound send skipped");
      return { skipped: true, payload };
    }
    const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(pageToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Meta send failed: ${response.status} ${await response.text()}`);

    const conversation = await this.getOrCreateConversationByPsid(recipientPsid);
    await this.prisma.message.create({ data: { conversationId: conversation.id, direction: "outbound", content: text } });
    return response.json();
  }

  listConversations() {
    return this.prisma.conversation.findMany({ where: { channel: "messenger" }, orderBy: { updatedAt: "desc" }, include: { customer: true }, take: 100 });
  }

  getConversationMessages(conversationId: string) {
    return this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
  }
}
