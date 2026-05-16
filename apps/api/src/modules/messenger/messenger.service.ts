import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { CustomersService } from "../customers/customers.service";

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService
  ) {}

  verify(mode?: string, token?: string, challenge?: string) {
    if (mode === "subscribe" && token === this.config.get<string>("META_VERIFY_TOKEN")) {
      return challenge ?? "";
    }
    return null;
  }

  async persistInbound(payload: {
    senderId: string;
    messageId?: string;
    text: string;
    rawPayload: unknown;
  }) {
    const customer = await this.customersService.findOrCreateByMessenger(payload.senderId);
    const conversation = await this.prisma.conversation.upsert({
      where: {
        id: `psid_${payload.senderId}`
      },
      update: {
        lastMessage: payload.text,
        updatedAt: new Date()
      },
      create: {
        id: `psid_${payload.senderId}`,
        customerId: customer.id,
        lastMessage: payload.text
      }
    });

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

    await this.prisma.message.create({
      data: {
        conversationId: `psid_${recipientPsid}`,
        direction: "outbound",
        content: text
      }
    });

    return response.json();
  }
}
