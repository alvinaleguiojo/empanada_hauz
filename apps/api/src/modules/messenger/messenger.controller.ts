import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { MESSENGER_QUEUE } from "../../common/enums";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MessengerService } from "./messenger.service";
import { SendMessageDto } from "./dto";

@Controller("messenger")
export class MessengerController {
  constructor(
    private readonly messengerService: MessengerService,
    @InjectQueue(MESSENGER_QUEUE) private readonly messengerQueue: Queue
  ) {}

  @Get("webhook")
  verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string
  ) {
    const verified = this.messengerService.verify(mode, token, challenge);
    return verified ?? "Verification failed";
  }

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(@Body() payload: any, @Headers("x-hub-signature-256") _signature?: string) {
    const entries = payload.entry ?? [];
    for (const entry of entries) {
      for (const event of entry.messaging ?? []) {
        const text = event.message?.text;
        if (!text || !event.sender?.id) {
          continue;
        }

        await this.messengerQueue.add(
          "incoming-message",
          {
            senderId: event.sender.id,
            messageId: event.message.mid,
            text,
            rawPayload: event
          },
          {
            attempts: 5,
            removeOnComplete: 1000,
            backoff: { type: "exponential", delay: 2000 }
          }
        );
      }
    }

    return { received: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("send")
  sendManual(@Body() dto: SendMessageDto) {
    return this.messengerService.sendText(dto.recipientPsid, dto.text);
  }

  @UseGuards(JwtAuthGuard)
  @Get("conversations")
  listConversations() {
    return this.messengerService.listConversations();
  }

  @UseGuards(JwtAuthGuard)
  @Get("conversations/:id/messages")
  getConversationMessages(@Param("id") id: string) {
    return this.messengerService.getConversationMessages(id);
  }
}
