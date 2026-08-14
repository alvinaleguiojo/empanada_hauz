import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ReferralJwtAuthGuard } from "../referrals/referral-jwt-auth.guard";
import { ReferralChatService, ReferralChatIdentity } from "./referral-chat.service";

type AuthenticatedRequest = Request & { user?: { sub?: string; role?: string; name?: string; email?: string; type?: string } };

@Controller("referrals/chat")
export class ReferralChatController {
  constructor(private readonly chat: ReferralChatService) {}

  @UseGuards(ReferralJwtAuthGuard)
  @Get("partner")
  async partnerConversation(@Req() req: AuthenticatedRequest) {
    return this.chat.getOrCreateConversation(this.partnerIdentity(req));
  }

  @UseGuards(ReferralJwtAuthGuard)
  @Get("partner/unread")
  async partnerUnread(@Req() req: AuthenticatedRequest) {
    return { unreadCount: await this.chat.getUnreadCount(this.partnerIdentity(req)) };
  }

  @UseGuards(ReferralJwtAuthGuard)
  @Get(":id/messages")
  async partnerMessages(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.chat.getMessages(id, this.partnerIdentity(req));
  }

  @UseGuards(ReferralJwtAuthGuard)
  @Post(":id/messages")
  async partnerSend(@Param("id") id: string, @Body() body: { content?: string }, @Req() req: AuthenticatedRequest) {
    return this.chat.sendMessage(id, this.partnerIdentity(req), body?.content ?? "");
  }

  @UseGuards(ReferralJwtAuthGuard)
  @Patch(":id/read")
  async partnerRead(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.chat.markRead(id, this.partnerIdentity(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get("admin/conversations")
  async adminConversations(@Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.chat.listAdminConversations();
  }

  @UseGuards(JwtAuthGuard)
  @Get("admin/:id/messages")
  async adminMessages(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.chat.getMessages(id, this.adminIdentity(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post("admin/:id/messages")
  async adminSend(@Param("id") id: string, @Body() body: { content?: string }, @Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.chat.sendMessage(id, this.adminIdentity(req), body?.content ?? "");
  }

  @UseGuards(JwtAuthGuard)
  @Patch("admin/:id/read")
  async adminRead(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.chat.markRead(id, this.adminIdentity(req));
  }

  private partnerIdentity(req: AuthenticatedRequest): ReferralChatIdentity {
    const id = req.user?.sub;
    if (!id) throw new ForbiddenException("Referral authentication required");
    return { type: "partner", id, name: req.user?.name ?? req.user?.email ?? "Referral Partner" };
  }

  private adminIdentity(req: AuthenticatedRequest): ReferralChatIdentity {
    const id = req.user?.sub;
    if (!id) throw new ForbiddenException("Admin authentication required");
    return { type: "admin", id, name: req.user?.name ?? req.user?.email ?? "Admin" };
  }

  private assertAdmin(req: AuthenticatedRequest) {
    if (req.user?.role !== "admin") throw new ForbiddenException("Admin access required");
  }
}
