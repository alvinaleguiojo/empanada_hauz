import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { AiActionConfigPatch, AiActionConfigService } from "./ai-action-config.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";

type AuthenticatedRequest = Request & { user?: { sub?: string } };
type CreateActionBody = { name?: string; label?: string; description?: string; executor?: string; enabled?: boolean };

@Controller("ai-actions")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiActionsController {
  constructor(private readonly configService: AiActionConfigService, private readonly registry: AiToolRegistryService) {}

  @Get("executors")
  async executors() { return this.registry.listApprovedExecutors(); }

  @Get()
  async list() { return this.registry.listForAdmin(); }

  @Post()
  async create(@Body() body: CreateActionBody, @Req() request: AuthenticatedRequest) {
    if (!request.user?.sub) throw new Error("Authenticated user is missing");
    return this.registry.createCustomAction(body, request.user.sub);
  }

  @Patch(":name")
  async update(@Param("name") name: string, @Body() body: AiActionConfigPatch, @Req() request: AuthenticatedRequest) {
    if (!request.user?.sub) throw new Error("Authenticated user is missing");
    return this.registry.configure(name, body, request.user.sub);
  }

  @Delete(":name")
  async reset(@Param("name") name: string) {
    await this.registry.resetConfiguration(name);
    return { success: true };
  }
}
