import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

const MAX_HISTORY = 200;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async listRecent() {
    const messages = await this.prisma.operatorChatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY
    });

    return messages
      .slice()
      .reverse()
      .map((message) => ({
        id: message.id,
        from: message.fromId,
        name: message.name,
        text: message.text,
        createdAt: message.createdAt.toISOString()
      }));
  }

  async record(input: { fromId: string; name: string; text: string; createdAt?: string }) {
    const message = await this.prisma.operatorChatMessage.create({
      data: {
        fromId: input.fromId,
        name: input.name,
        text: input.text,
        createdAt: input.createdAt ? new Date(input.createdAt) : undefined
      }
    });

    return {
      id: message.id,
      from: message.fromId,
      name: message.name,
      text: message.text,
      createdAt: message.createdAt.toISOString()
    };
  }
}
