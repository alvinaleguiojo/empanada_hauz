import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { MESSENGER_QUEUE } from "../../common/enums";
import { PrismaService } from "../../database/prisma.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersService } from "../orders/orders.service";
import { MessengerService } from "./messenger.service";

@Processor(MESSENGER_QUEUE)
export class MessengerProcessor extends WorkerHost {
  constructor(
    private readonly messengerService: MessengerService,
    private readonly aiService: AiService,
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {
    super();
  }

  async process(job: Job<any>) {
    const senderId = job.data.senderId as string;
    const text = job.data.text as string;
    const stored = await this.messengerService.persistInbound({
      senderId,
      messageId: job.data.messageId,
      text,
      rawPayload: job.data.rawPayload
    });

    const ai = await this.aiService.classifyAndExtract(text);
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
      await this.ordersService.createFromAi({
        customerId: conversation.customerId,
        conversationId: conversation.id,
        quantity: ai.details.quantity,
        location: ai.details.location,
        preferredTime: ai.details.preferredTime,
        deliveryMethod: ai.details.deliveryMethod,
        notes: text
      });
      this.notificationsService.notify("order.created_from_messenger", {
        conversationId: conversation.id,
        senderId
      });
    }

    await this.messengerService.sendText(senderId, ai.suggestedReply);
    return { ok: true };
  }
}
