import { BadRequestException, Controller, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { TranscriptionService } from "./transcription.service";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "video/webm"
]);

type UploadedAudio = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

@Controller("transcribe")
@UseGuards(JwtAuthGuard, AdminGuard)
export class TranscriptionController {
  constructor(private readonly transcription: TranscriptionService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_AUDIO_BYTES } }))
  async transcribe(@UploadedFile() file: UploadedAudio | undefined, @Query("language") language?: string) {
    if (!file) throw new BadRequestException("An audio file is required in the 'file' field.");
    if (file.size > MAX_AUDIO_BYTES) throw new BadRequestException("Audio file exceeds the 25 MB limit.");
    if (file.mimetype && !ALLOWED_AUDIO_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported audio type: ${file.mimetype}`);
    }

    return this.transcription.transcribe(file.buffer, file.originalname, file.mimetype, language);
  }
}
