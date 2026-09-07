import { Body, Controller, Get, Headers, HttpCode, Logger, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { timingSafeEqual, createHmac } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MessengerService } from "./messenger.service";
import { SendMessageDto } from "./dto";
import { MetaAuthService } from "./meta-auth.service";
import { MessengerOrderSummaryService } from "./messenger-order-summary.service";
interface RawBodyRequest extends Request { rawBody?: Buffer }
@Controller("messenger")
export class MessengerController {
  private readonly logger = new Logger(MessengerController.name);
  constructor(private readonly messengerService: MessengerService, private readonly metaAuthService: MetaAuthService, private readonly messengerOrderSummaryService: MessengerOrderSummaryService) {}
  @Get("webhook") verify(@Query("hub.mode") mode?: string, @Query("hub.verify_token") token?: string, @Query("hub.challenge") challenge?: string) { const verified = this.messengerService.verify(mode, token, challenge); return verified ?? "Verification failed"; }
  @Post("webhook") @HttpCode(200)
  async handleWebhook(@Body() payload: any, @Headers("x-hub-signature-256") signature: string | undefined, @Req() request: RawBodyRequest) {
    const rawBody = request.rawBody; const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    const messagingCount = entries.reduce((sum: number, entry: any) => sum + (Array.isArray(entry?.messaging) ? entry.messaging.length : 0), 0);
    const standbyCount = entries.reduce((sum: number, entry: any) => sum + (Array.isArray(entry?.standby) ? entry.standby.length : 0), 0);
    const handoverCount = entries.reduce((sum: number, entry: any) => sum + (Array.isArray(entry?.messaging_handovers) ? entry.messaging_handovers.length : 0), 0);
    this.logger.log(`Meta webhook POST received: signature=${Boolean(signature)} rawBody=${Boolean(rawBody)} rawBodyLength=${rawBody?.length ?? 0} object=${payload?.object ?? "unknown"} entries=${entries.length} messaging=${messagingCount} standby=${standbyCount} handovers=${handoverCount}`);
    if (!this.verifySignature(rawBody, signature)) { this.logger.warn(`Rejected Messenger webhook: invalid signature`); return { received: false }; }
    const pageId = this.metaAuthService.getConfiguredPageId();
    if (entries.some((entry: any) => pageId && entry?.id && entry.id !== pageId)) this.logger.warn(`Ignoring Messenger events for unexpected Page ID`);
    setImmediate(() => { void this.processWebhookEntries(entries.filter((entry: any) => !pageId || !entry?.id || entry.id === pageId)); });
    return { received: true };
  }
  private async processWebhookEntries(entries: any[]) { for (const entry of entries) { await this.processEvents(entry.messaging ?? [], "messaging"); await this.processEvents(entry.standby ?? [], "standby"); for (const handover of entry.messaging_handovers ?? []) this.logger.log(`Messenger handover event: sender=${handover.sender?.id ?? "unknown"}`); } }
  private async processEvents(events: any[], channel: "messaging" | "standby") {
    for (const event of events) {
      const text = event.message?.text; const attachments = event.message?.attachments;
      const hasAttachments = Array.isArray(attachments?.data) ? attachments.data.length > 0 : Array.isArray(attachments) ? attachments.length > 0 : Boolean(attachments);
      const senderId = event.sender?.id; if (!senderId) continue;
      if (channel === "standby") { try { await this.messengerService.handleStandbyEvent({ senderId, messageId: event.message?.mid, text, rawPayload: event }); } catch (err) { this.logger.error(`Failed standby event from ${senderId}`, err); } continue; }
      if (event.message?.is_echo === true || (!text && !hasAttachments)) continue;
      try { if (text) await this.messengerService.processIncoming({ senderId, messageId: event.message?.mid, text, rawPayload: event }); else await this.messengerService.persistInbound({ senderId, messageId: event.message?.mid, text: "[Attachment]", type: "attachment", rawPayload: event }); }
      catch (err) { this.logger.error(`Failed to process message from ${senderId}`, err); }
    }
  }
  private verifySignature(rawBody?: Buffer, signature?: string) {
    const appSecret = process.env.META_APP_SECRET; if (!rawBody || !signature || !appSecret) return false;
    const [scheme, received] = signature.split("="); if (scheme !== "sha256" || !received || !/^[a-f0-9]{64}$/i.test(received)) return false;
    const expectedBuffer = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex"); const receivedBuffer = Buffer.from(received, "hex");
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  }
  @UseGuards(JwtAuthGuard) @Get("auth") authStatus() { return this.metaAuthService.status(); }
  @Get("auth/connect") async connect(@Res() response: Response) { return response.redirect(await this.metaAuthService.beginOAuth()); }
  @Get("auth/callback") async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string | undefined, @Res() response: Response) { if (error) return response.status(400).send(`Meta authorization failed: ${error}`); try { await this.metaAuthService.handleOAuthCallback(code, state); return response.redirect(`${process.env.WEB_APP_URL ?? "http://localhost:3001"}/inbox?meta=connected`); } catch (err) { this.logger.error("Meta OAuth callback failed", err); return response.status(400).send(err instanceof Error ? err.message : "Meta authorization failed"); } }
  @UseGuards(JwtAuthGuard) @Get("ai/settings") getAiSettings() { return this.messengerService.getAiSettings(); }
  @UseGuards(JwtAuthGuard) @Put("ai/settings") setAiSettings(@Body() body: { enabled?: boolean }) { return this.messengerService.setGlobalAiEnabled(Boolean(body?.enabled)); }
  @UseGuards(JwtAuthGuard) @Get("ai/customers/:customerId") getCustomerAiSettings(@Param("customerId") customerId: string) { return this.messengerService.getCustomerAiSettings(customerId); }
  @UseGuards(JwtAuthGuard) @Put("ai/customers/:customerId") setCustomerAiSettings(@Param("customerId") customerId: string, @Body() body: { enabled?: boolean | null }) { return this.messengerService.setCustomerAiEnabled(customerId, typeof body?.enabled === "boolean" ? body.enabled : null); }
  @UseGuards(JwtAuthGuard) @Post("send") sendManual(@Body() dto: SendMessageDto) { return this.messengerService.sendText(dto.recipientPsid, dto.text); }
  @UseGuards(JwtAuthGuard) @Post("sync") syncHistory(@Query("maxConversations") maxConversations?: string, @Query("maxMessagesPerConversation") maxMessagesPerConversation?: string) { return this.messengerService.syncFromMeta({ maxConversations: maxConversations ? Number(maxConversations) : undefined, maxMessagesPerConversation: maxMessagesPerConversation ? Number(maxMessagesPerConversation) : undefined }); }
  @UseGuards(JwtAuthGuard) @Get("conversations") listConversations() { return this.messengerService.listConversations(); }
  @UseGuards(JwtAuthGuard) @Get("conversations/:id/messages") getConversationMessages(@Param("id") id: string) { return this.messengerService.getConversationMessages(id); }
}
