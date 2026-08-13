import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @UseGuards(JwtAuthGuard)
  @Get("messages")
  listMessages() {
    return this.chatService.listRecent();
  }
}
