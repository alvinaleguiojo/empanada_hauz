import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export interface AiOrderDraft {
  items?: Array<{ name: string; quantity: number; unitPrice?: number; subtotal?: number }>;
  quantity?: number;
  deliveryMethod?: "pickup" | "maxim";
  address?: string;
  landmark?: string;
  contactNumber?: string;
  paymentMethod?: "cod" | "gcash";
  deliveryDate?: string;
  preferredTime?: string;
}

export interface AiConversationState {
  _id: string;
  conversationId: string;
  customerId: string;
  draft?: AiOrderDraft;
  updatedAt: Date | string;
}

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };

@Injectable()
export class AiConversationStateService {
  private readonly collection = "ai_conversation_states";
  constructor(private readonly prisma: PrismaService) {}

  async get(conversationId: string, customerId: string): Promise<AiConversationState | null> {
    if (!conversationId || !customerId) throw new BadRequestException("Conversation and customer context are required.");
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, filter: { conversationId, customerId }, limit: 1 })) as unknown as MongoFindResult<AiConversationState>;
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  async saveDraft(conversationId: string, customerId: string, draft: AiOrderDraft) {
    if (!conversationId || !customerId) throw new BadRequestException("Conversation and customer context are required.");
    const now = new Date();
    const existing = await this.get(conversationId, customerId);
    const identity = { conversationId, customerId, updatedAt: now, draft: draft as unknown as Prisma.InputJsonValue };
    const command = {
      update: this.collection,
      updates: [{
        q: { conversationId, customerId },
        u: { $set: identity, ...(existing ? {} : { $setOnInsert: { _id: `${customerId}:${conversationId}` } }) },
        upsert: true,
        multi: false
      }]
    } as unknown as Prisma.InputJsonObject;
    await this.prisma.$runCommandRaw(command);
    return { _id: existing?._id ?? `${customerId}:${conversationId}`, conversationId, customerId, updatedAt: now, draft };
  }

  async clear(conversationId: string, customerId: string) {
    if (!conversationId || !customerId) return { ok: true };
    const command = { delete: this.collection, deletes: [{ q: { conversationId, customerId }, limit: 1 }] } as unknown as Prisma.InputJsonObject;
    await this.prisma.$runCommandRaw(command);
    return { ok: true };
  }
}
