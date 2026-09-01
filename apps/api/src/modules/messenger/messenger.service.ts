import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { AiService } from "../ai/ai.service";
import { OrdersService } from "../orders/orders.service";
import { NotificationsService } from "../notifications/notifications.service";

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

  // Runs synchronously inside the webhook request instead of going through a
  // Redis-backed queue. No Redis is provisioned for this project, so
  // BullMQ's queue.add() would hang indefinitely trying to connect,
  // producing a Cloudflare 524 on every real webhook POST. This does the
  // same work the old MessengerProcessor did, just inline.
  async processIncoming(event: { senderId: string; messageId?: string; text: string; rawPayload: unknown }) {
    const stored = await this.persistInbound(event);

    const ai = await this.aiService.classifyAndExtract(event.text);
    await this.prisma.message.update({
      where: { id: stored.id },
      data: {
        aiIntent: ai.intent,
        aiConfidence: ai.confidence,
        extractedOrder: ai.details as never,
        processedAt: new Date()
      }
    });

    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: stored.conversationId }
    });

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
      this.notificationsService.notify("order.created_from_messenger", {
        conversationId: conversation.id,
        senderId: event.senderId
      });
    }

    await this.sendText(event.senderId, ai.suggestedReply);
  }

  verify(mode?: string, token?: string, challenge?: string) {
    if (mode === "subscribe" && token === this.config.get<string>("META_VERIFY_TOKEN")) {
      return challenge ?? "";
    }
    return null;
  }

  // Conversation.id is a Mongo ObjectId, so it can never be set to a
  // hand-rolled string like `psid_<senderId>`. Instead we look conversations
  // up by their owning customer's messengerPsid and let Mongo generate the id.
  private async getOrCreateConversationByPsid(psid: string, lastMessage?: string) {
    const customer = await this.customersService.findOrCreateByMessenger(psid);

    const existing = await this.prisma.conversation.findFirst({
      where: { customerId: customer.id, channel: "messenger" }
    });

    if (existing) {
      if (lastMessage !== undefined) {
        return this.prisma.conversation.update({
          where: { id: existing.id },
          data: { lastMessage, updatedAt: new Date() }
        });
      }
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        customerId: customer.id,
        channel: "messenger",
        lastMessage
      }
    });
  }

  async persistInbound(payload: {
    senderId: string;
    messageId?: string;
    text: string;
    rawPayload: unknown;
  }) {
    const conversation = await this.getOrCreateConversationByPsid(payload.senderId, payload.text);

    return this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        metaMessageId: payload.messageId,
        direction: "inbound",
        content: payload.text,
        rawPayload: payload.rawPayload as never
      }
    });
  }

  async sendText(recipientPsid: string, text: string) {
    const pageToken = this.config.get<string>("META_PAGE_ACCESS_TOKEN");
    const endpoint = "https://graph.facebook.com/v19.0/me/messages";
    const payload = {
      recipient: { id: recipientPsid },
      messaging_type: "RESPONSE",
      message: { text }
    };

    if (!pageToken) {
      this.logger.warn("META_PAGE_ACCESS_TOKEN not configured; outbound send skipped");
      return { skipped: true, payload };
    }

    const response = await fetch(`${endpoint}?access_token=${pageToken}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Meta send failed: ${response.status} ${await response.text()}`);
    }

    const conversation = await this.getOrCreateConversationByPsid(recipientPsid);

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        content: text
      }
    });

    return response.json();
  }

  listConversations() {
    return this.prisma.conversation.findMany({
      where: { channel: "messenger" },
      orderBy: { updatedAt: "desc" },
      include: { customer: true },
      take: 100
    });
  }

  getConversationMessages(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" }
    });
  }
}
