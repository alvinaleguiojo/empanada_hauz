import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../../database/database.module";
import { AdminGuard } from "./admin.guard";
import { AiInstructionsController } from "./ai-instructions.controller";
import { AiInstructionsService } from "./ai-instructions.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AiInstructionsController],
  providers: [AiInstructionsService, AdminGuard],
  exports: [AiInstructionsService]
})
export class AiInstructionsModule {}
