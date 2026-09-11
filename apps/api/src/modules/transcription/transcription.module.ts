import { Module } from "@nestjs/common";
import { TranscriptionController } from "./transcription.controller";
import { TranscriptionService } from "./transcription.service";

@Module({
  controllers: [TranscriptionController],
  providers: [TranscriptionService],
  exports: [TranscriptionService]
})
export class TranscriptionModule {}
