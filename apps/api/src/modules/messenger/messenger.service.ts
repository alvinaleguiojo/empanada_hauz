import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { NotificationsService } from "../notifications/notifications.service";
import { McpOrdersService } from "../mcp/mcp-orders.service";
import { AiRuntimeService } from "../ai/ai-runtime.service";
import { AiControlService } from "../ai/ai-control.service";
import { MetaAuthService } from "./meta-auth.service";

interface MetaPage<T> { data?: T[]; paging?: { next?: string } }
interface MetaParticipant { id?: string; name?: string }
interface MetaConversation { id: string; participants?: { data?: MetaParticipant[] }; updated_time?: string }
interface MetaAttachment { type?: string; payload?: Record<string, unknown> }
interface MetaMessage { id: string; message?: string; created_time?: string; from?: MetaParticipant; to?: { data?: MetaParticipant[] }; attachments?: { data?: MetaAttachment[] } | MetaAttachment[]; tags?: unknown }

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly aiRuntimeService: AiRuntimeService,
    private readonly aiControlService: AiControlService,
    private readonly notificationsService: NotificationsService,
    private readonly mcpOrdersService: McpOrdersService,
    private readonly metaAuthService: MetaAuthService
  ) {}

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
        if (newestMessage?.created_time && newestMessage.created_time !== metaConversation.updated_time) await this.prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date(newestMessage.created_time) } });
      }
      nextUrl = page.paging?.next;
    }
    return { conversationsSeen, conversationsImported, messagesImported };
  }

  private pageId() { return this.metaAuthService.getConfiguredPageId(); }
  private graphVersion() { return this.config.get<string>("META_GRAPH_VERSION") ?? "v23.0"; }
  private async metaGet<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${await this.metaAuthService.getAccessToken()}` } });
    if (!response.ok) throw new Error(`Meta Graph request failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<T>;
  }
  private findCustomerParticipant(participants: MetaParticipant[], pageId: string) { return participants.find((participant) => participant.id && participant.id !== pageId); }
  private messageTime(message: MetaMessage) { return message.created_time ? new Date(message.created_time).getTime() : 0; }
  private hasAttachments(message: MetaMessage) { return Array.isArray(message.attachments?.data) ? message.attachments.data.length > 0 : Array.isArray(message.attachments) ? message.attachments.length > 0 : false; }
  private messageContent(message: MetaMessage) { return message.message?.trim() || (this.hasAttachments(message) ? "[Attachment]" : ""); }

  async getAiSettings() { return this.aiControlService.getState(); }
  async setGlobalAiEnabled(enabled: boolean) { return this.aiControlService.setGlobalEnabled(enabled); }
  async getCustomerAiSettings(customerId: string) { return this.aiControlService.getCustomerState(customerId); }
  async setCustomerAiEnabled(customerId: string, enabled: boolean | null) { return this.aiControlService.setCustomerOverride(customerId, enabled); }

  verify(mode?: string, token?: string, challenge?: string) { const expected = this.config.get<string>("META_VERIFY_TOKEN"); return mode === "subscribe" && token && expected && token === expected ? challenge : null; }
  async sendText(recipientPsid: string, text: string) { return this.metaAuthService.sendMessage(recipientPsid, text); }
  async persistInbound(input: { senderId: string; messageId?: string; text: string; type?: "text" | "attachment"; rawPayload?: unknown }) { return this.storeMessage(input); }
  async processIncoming(input: { senderId: string; messageId?: string; text: string; rawPayload?: unknown }) { await this.persistInbound({ ...input, type: "text" }); return this.sendText(input.senderId, "Thanks for your message! 😊"); }
  async handleStandbyEvent(input: { senderId: string; messageId?: string; text?: string; rawPayload?: unknown }) { this.logger.log(`Messenger standby event received: sender=${input.senderId} message=${input.messageId ?? "none"}`); }
  async listConversations() { return this.prisma.conversation.findMany({ where: { channel: "messenger" }, orderBy: { updatedAt: "desc" }, include: { customer: true } }); }
  async getConversationMessages(id: string) { return this.prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" } }); }
  async getMessengerProfileName(senderId: string) { return this.metaAuthService.getMessengerProfileName(senderId); }

  private async storeMessage(input: { senderId: string; messageId?: string; text: string; type?: "text" | "attachment"; rawPayload?: unknown }) {
    const customer = await this.customersService.findOrCreateByMessenger(input.senderId, "Messenger Customer");
    const conversation = await this.prisma.conversation.findFirst({ where: { customerId: customer.id, channel: "messenger" } }) ?? await this.prisma.conversation.create({ data: { customerId: customer.id, channel: "messenger" } });
    return this.prisma.message.create({ data: { conversationId: conversation.id, metaMessageId: input.messageId, direction: "inbound", type: input.type ?? "text", content: input.text, rawPayload: input.rawPayload as Prisma.InputJsonValue } });
  }
}
