import { BadRequestException, Body, Controller, Logger, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { TtsService } from "./tts.service";

@Controller("tts")
@UseGuards(JwtAuthGuard, AdminGuard)
export class TtsController {
  private readonly logger = new Logger(TtsController.name);

  constructor(private readonly tts: TtsService) {}

  @Post("warmup")
  async warmup() {
    this.logger.log("TTS warmup request received");
    await this.tts.warmup();
    this.logger.log("TTS warmup completed");
    return { ok: true };
  }

  @Post()
  async synthesize(@Body() body: { text?: string }, @Res() response: Response) {
    const text = body?.text?.trim();
    if (!text) throw new BadRequestException("TTS text is required.");
    this.logger.log(`TTS synthesis request received (${text.length} chars)`);

    const audio = await this.tts.synthesize(text);
    response.setHeader("content-type", "audio/wav");
    response.setHeader("cache-control", "no-store");
    response.send(audio);
  }
}
