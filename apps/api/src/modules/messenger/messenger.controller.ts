import { Body, Controller, Get, Headers, HttpCode, Logger, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { timingSafeEqual, createHmac } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MessengerService } from "./messenger.service";
import { SendMessageDto } from "./dto";
import { MetaAuthService } from "./meta-auth.service";

interface RawBodyRequest extends Request { rawBody?: Buffer }

@Controller("messenger")
export class MessengerController {
  private readonly logger = new Logger(MessengerController.name);
  constructor(private readonly messengerService: MessengerService, private readonly metaAuthService: MetaAuthService) {}

  @Get("webhook")
  verify(@Query("hub.mode") mode?: string, @Query("hub.verify_token") token?: string, @Query("hub.challenge") challenge?: string) {
    const verified = this.messengerService.verify(mode, token, challenge);
    return verified ?? "Verification failed";
  }

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: any,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Req() request: RawBodyRequest
  ) {
    if (!this.verifySignature(request.rawBody, signature)) {
      this.logger.warn("Rejected Messenger webhook request with invalid x-hub-signature-256");
      return { received: false };
    }

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const text = event.message?.text;
        if (!text || !event.sender?.id) continue;
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

  private verifySignature(rawBody?: Buffer, signature?: string) {
    const appSecret = process.env.META_APP_SECRET;
    if (!rawBody || !signature || !appSecret) return false;
    const [scheme, received] = signature.split("=");
    if (scheme !== "sha256" || !received || !/^[a-f0-9]{64}$/i.test(received)) return false;
    const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(received, "hex");
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  @UseGuards(JwtAuthGuard)
  @Get("auth")
  authStatus() { return this.metaAuthService.status(); }

  @Get("auth/connect")
  async connect(@Res() response: Response) { return response.redirect(await this.metaAuthService.beginOAuth()); }

  @Get("auth/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string | undefined, @Res() response: Response) {
    if (error) return response.status(400).send(`Meta authorization failed: ${error}`);
    try {
      await this.metaAuthService.handleOAuthCallback(code, state);
      return response.redirect(`${process.env.WEB_APP_URL ?? "http://localhost:3001"}/inbox?meta=connected`);
    }
    catch (err) { this.logger.error("Meta OAuth callback failed", err); return response.status(400).send(err instanceof Error ? err.message : "Meta authorization failed"); }
  }

  @UseGuards(JwtAuthGuard)
  @Post("send")
  sendManual(@Body() dto: SendMessageDto) { return this.messengerService.sendText(dto.recipientPsid, dto.text); }
  @UseGuards(JwtAuthGuard)
  @Post("sync")
  syncHistory(@Query("maxConversations") maxConversations?: string, @Query("maxMessagesPerConversation") maxMessagesPerConversation?: string) { return this.messengerService.syncFromMeta({ maxConversations: maxConversations ? Number(maxConversations) : undefined, maxMessagesPerConversation: maxMessagesPerConversation ? Number(maxMessagesPerConversation) : undefined }); }
  @UseGuards(JwtAuthGuard)
  @Get("conversations")
  listConversations() { return this.messengerService.listConversations(); }
  @UseGuards(JwtAuthGuard)
  @Get("conversations/:id/messages")
  getConversationMessages(@Param("id") id: string) { return this.messengerService.getConversationMessages(id); }
}
