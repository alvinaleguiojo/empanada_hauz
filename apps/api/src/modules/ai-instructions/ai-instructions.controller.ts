import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import { CreateAiInstructionDto, UpdateAiInstructionDto } from "./dto";
import { AiInstructionsService } from "./ai-instructions.service";

type AuthenticatedRequest = Request & { user?: { sub?: string } };

@Controller("ai-instructions")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiInstructionsController {
  constructor(private readonly aiInstructionsService: AiInstructionsService) {}

  @Get()
  list() {
    return this.aiInstructionsService.list();
  }

  @Post()
  create(@Body() dto: CreateAiInstructionDto, @Req() request: AuthenticatedRequest) {
    if (!request.user?.sub) {
      throw new Error("Authenticated user is missing");
    }
    return this.aiInstructionsService.create(dto, request.user.sub);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAiInstructionDto) {
    return this.aiInstructionsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.aiInstructionsService.remove(id);
  }
}
