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
    const rawBody = request.rawBody;
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    const messagingCount = entries.reduce((sum: number, entry: any) => sum + (Array.isArray(entry?.messaging) ? entry.messaging.length : 0), 0);
    const standbyCount = entries.reduce((sum: number, entry: any) => sum + (Array.isArray(entry?.standby) ? entry.standby.length : 0), 0);
    const handoverCount = entries.reduce((sum: number, entry: any) => sum + (Array.isArray(entry?.messaging_handovers) ? entry.messaging_handovers.length : 0), 0);
    this.logger.log(
      `Meta webhook POST received: signature=${Boolean(signature)} rawBody=${Boolean(rawBody)} rawBodyLength=${rawBody?.length ?? 0} object=${payload?.object ?? "unknown"} entries=${entries.length} messaging=${messagingCount} standby=${standbyCount} handovers=${handoverCount}`
    );

    if (!this.verifySignature(rawBody, signature)) {
      this.logger.warn(
        `Rejected Messenger webhook: invalid signature (signature=${Boolean(signature)}, rawBody=${Boolean(rawBody)}, rawBodyLength=${rawBody?.length ?? 0}, appSecret=${Boolean(process.env.META_APP_SECRET)})`
      );
      return { received: false };
    }

    const pageId = this.metaAuthService.getConfiguredPageId();
    const unexpectedEntries = entries.filter((entry: any) => pageId && entry?.id && entry.id !== pageId);
    if (unexpectedEntries.length > 0) {
      this.logger.warn(`Ignoring ${unexpectedEntries.length} webhook entr${unexpectedEntries.length === 1 ? "y" : "ies"} for unexpected Page ID`);
    }

    this.logger.log(`Meta webhook signature verified: entries=${entries.length} messaging=${messagingCount} standby=${standbyCount} handovers=${handoverCount}`);
    if (standbyCount > 0) this.logger.warn(`Meta delivered ${standbyCount} standby event(s): another receiver may control the conversation thread`);

    // Acknowledge Meta immediately after authentication. Do not make Meta wait
    // for database, AI, notifications, or outbound Messenger API calls.
    setImmediate(() => {
      void this.processWebhookEntries(entries.filter((entry: any) => !pageId || !entry?.id || entry.id === pageId));
    });

    return { received: true };
  }

  private async processWebhookEntries(entries: any[]) {
    for (const entry of entries) {
      await this.processEvents(entry.messaging ?? [], "messaging");
      await this.processEvents(entry.standby ?? [], "standby");
      for (const handover of entry.messaging_handovers ?? []) {
        this.logger.log(`Messenger handover event: sender=${handover.sender?.id ?? "unknown"} appRoles=${JSON.stringify(handover.app_roles ?? handover.appRoles ?? null)}`);
      }
    }
  }

  private async processEvents(events: any[], channel: "messaging" | "standby") {
    for (const event of events) {
      const text = event.message?.text;
      const senderId = event.sender?.id;
      if (!senderId) {
        this.logger.debug(`Ignoring Messenger ${channel} event without sender`);
        continue;
      }

      if (channel === "standby") {
        this.logger.warn(`Messenger standby event received: sender=${senderId} messageId=${event.message?.mid ?? "unknown"} text=${Boolean(text)}`);
        try {
          const result = await this.messengerService.handleStandbyEvent({ senderId, messageId: event.message?.mid, text, rawPayload: event });
          this.logger.log(`Messenger standby event handled: sender=${senderId} action=${result.action}`);
        } catch (err) {
          this.logger.error(`Failed to handle Messenger standby event from ${senderId}`, err instanceof Error ? err.stack : String(err));
        }
        continue;
      }

      // Meta can deliver echo events for messages sent by the Page. Those are
      // already persisted and broadcast by sendText(), so do not turn them
      // into duplicate inbound/customer messages.
      if (event.message?.is_echo === true) {
        this.logger.debug(`Ignoring Messenger echo event: sender=${senderId} messageId=${event.message?.mid ?? "unknown"}`);
        continue;
      }

      if (!text) {
        this.logger.debug(`Ignoring Messenger event without text: sender=${senderId}`);
        continue;
      }

      try {
        this.logger.log(`Processing Messenger message: sender=${senderId} messageId=${event.message?.mid ?? "unknown"}`);
        await this.messengerService.processIncoming({
          senderId,
          messageId: event.message?.mid,
          text,
          rawPayload: event
        });
        this.logger.log(`Processed Messenger message: sender=${senderId} messageId=${event.message?.mid ?? "unknown"}`);
      } catch (err) {
        this.logger.error(`Failed to process message from ${senderId}`, err instanceof Error ? err.stack : String(err));
      }
    }
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
