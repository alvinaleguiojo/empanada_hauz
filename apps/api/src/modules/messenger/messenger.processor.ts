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
      await this.ordersService.createManual({
        customerName: `Messenger ${senderId}`,
        quantity: ai.details.quantity,
        unitPrice: 20,
        deliveryFee: 0,
        deliveryMethod: ai.details.deliveryMethod,
        paymentMethod: "cod",
        address: ai.details.deliveryMethod === "maxim" ? ai.details.location : undefined,
        location: ai.details.location,
        preferredSchedule: ai.details.preferredTime,
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
