import { Body, Controller, Delete, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { AiActionConfigService } from "./ai-action-config.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";

type AuthenticatedRequest = Request & { user?: { sub?: string } };

type UpdateActionBody = {
  enabled?: boolean;
  label?: string;
  description?: string;
};

@Controller("ai-actions")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiActionsController {
  constructor(private readonly configService: AiActionConfigService, private readonly registry: AiToolRegistryService) {
    void this.configService;
  }

  @Get()
  async list() {
    return this.registry.listForAdmin();
  }

  @Patch(":name")
  async update(@Param("name") name: string, @Body() body: UpdateActionBody, @Req() request: AuthenticatedRequest) {
    if (!request.user?.sub) throw new Error("Authenticated user is missing");
    return this.registry.configure(name, body, request.user.sub);
  }

  @Delete(":name")
  async reset(@Param("name") name: string) {
    await this.registry.resetConfiguration(name);
    return { success: true };
  }
}
