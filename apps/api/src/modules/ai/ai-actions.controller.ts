import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { AiActionConfigPatch } from "./ai-action-config.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { AiModelService } from "./ai-model.service";

type AuthenticatedRequest = Request & { user?: { sub?: string } };

@Controller("ai-actions")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiActionsController {
  constructor(private readonly registry: AiToolRegistryService, private readonly aiModel: AiModelService) {}

  @Get()
  async list() { return this.registry.listForAdmin(); }

  @Get("model")
  async getModel() { return this.aiModel.getSettings(); }

  @Patch("model")
  async updateModel(@Body() body: { provider?: string; model?: string }) {
    return this.aiModel.setSettings(body.provider ?? "", body.model ?? "");
  }

  @Post("generate-product")
  async generateProduct(@Body() body: { prompt?: string; existingProducts?: Array<{ name: string; category: string }> }) {
    return this.aiModel.generateProduct(body.prompt ?? "", body.existingProducts ?? []);
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
