import { Body, Controller, Logger, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { AdminAgentFacadeService } from "./admin-agent/admin-agent-facade.service";

type AuthenticatedRequest = Request & { user?: { id?: string; email?: string; name?: string; role?: string } };

@Controller("ai-admin-agent")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiAdminAgentController {
  private readonly logger = new Logger(AiAdminAgentController.name);

  constructor(private readonly agent: AdminAgentFacadeService) {}

  @Post("chat")
  async chat(
    @Body() body: { message?: string; conversationId?: string; history?: Array<{ role: "user" | "assistant"; content: string }> },
    @Req() request: AuthenticatedRequest
  ) {
    const adminId = request.user?.id?.trim();
    if (!adminId) throw new Error("Authenticated admin identity is required.");
    const conversationId = body.conversationId?.trim() || `admin:${adminId}`;
    const message = body.message?.trim() ?? "";

    this.logger.log(`Admin AI request: ${message.slice(0, 160)}`);
    try {
      const result = await this.agent.process({ message, history: body.history, adminId, conversationId });
      this.logger.log(`Admin AI response ready: ${String(result.reply ?? "").slice(0, 160)}`);
      return result;
    } catch (error) {
      this.logger.error(`Admin AI request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
