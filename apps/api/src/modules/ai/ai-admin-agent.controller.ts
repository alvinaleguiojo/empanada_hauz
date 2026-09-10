import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { AiAdminAgentService } from "./ai-admin-agent.service";

type AuthenticatedRequest = Request & { user?: { id?: string; email?: string; name?: string; role?: string } };

@Controller("ai-admin-agent")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiAdminAgentController {
  constructor(private readonly agent: AiAdminAgentService) {}

  @Post("chat")
  async chat(
    @Body() body: { message?: string; conversationId?: string; history?: Array<{ role: "user" | "assistant"; content: string }> },
    @Req() request: AuthenticatedRequest
  ) {
    const adminId = request.user?.id?.trim();
    if (!adminId) throw new Error("Authenticated admin identity is required.");
    const conversationId = body.conversationId?.trim() || `admin:${adminId}`;
    return this.agent.process({ message: body.message ?? "", history: body.history, adminId, conversationId });
  }
}
