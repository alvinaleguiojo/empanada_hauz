import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService]
})
export class ChatModule {}
