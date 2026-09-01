import { Body, Controller, Get, Headers, HttpCode, Logger, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MessengerService } from "./messenger.service";
import { SendMessageDto } from "./dto";

@Controller("messenger")
export class MessengerController {
  private readonly logger = new Logger(MessengerController.name);

  constructor(private readonly messengerService: MessengerService) {}

  @Get("webhook")
  verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string
  ) {
    const verified = this.messengerService.verify(mode, token, challenge);
    return verified ?? "Verification failed";
  }

  // No queue here on purpose: this project doesn't run Redis, and
  // queue.add() would otherwise hang indefinitely trying to connect,
  // producing a Cloudflare 524 on every real webhook call. Meta only waits
  // ~20s for a 200 response, and inline AI classification + a DB write
  // comfortably fits inside that.
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

        try {
          await this.messengerService.processIncoming({
            senderId: event.sender.id,
            messageId: event.message.mid,
            text,
            rawPayload: event
          });
        } catch (err) {
          this.logger.error(`Failed to process message from ${event.sender.id}`, err);
        }
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
