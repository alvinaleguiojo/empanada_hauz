import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { StrictReplyAiService } from "./strict-reply-ai.service";

@Module({
  providers: [{ provide: AiService, useClass: StrictReplyAiService }],
  exports: [AiService]
})
export class AiModule {}
