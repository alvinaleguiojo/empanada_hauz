import { BadRequestException, Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { TtsService } from "./tts.service";

@Controller("tts")
@UseGuards(JwtAuthGuard, AdminGuard)
export class TtsController {
  constructor(private readonly tts: TtsService) {}

  @Post()
  async synthesize(@Body() body: { text?: string }, @Res() response: Response) {
    const text = body?.text?.trim();
    if (!text) throw new BadRequestException("TTS text is required.");

    const audio = await this.tts.synthesize(text);
    response.setHeader("content-type", "audio/wav");
    response.setHeader("cache-control", "no-store");
    response.send(audio);
  }
}
