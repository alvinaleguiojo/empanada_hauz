import { Injectable } from "@nestjs/common";
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
    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { conversationId, customerId },
      limit: 1
    })) as unknown as MongoFindResult<AiConversationState>;
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  async saveDraft(conversationId: string, customerId: string, draft: AiOrderDraft) {
    const now = new Date();
    const existing = await this.get(conversationId, customerId);
    const document: AiConversationState = {
      _id: existing?._id ?? `${customerId}:${conversationId}`,
      conversationId,
      customerId,
      draft,
      updatedAt: now
    };
    await this.prisma.$runCommandRaw({
      update: this.collection,
      updates: [{
        q: { conversationId, customerId },
        u: { $set: document },
        upsert: true,
        multi: false
      }]
    });
    return document;
  }

  async clear(conversationId: string, customerId: string) {
    await this.prisma.$runCommandRaw({
      delete: this.collection,
      deletes: [{ q: { conversationId, customerId }, limit: 1 }]
    });
    return { ok: true };
  }

  static toMongoJson(value: unknown) {
    return value as Prisma.InputJsonValue;
  }
}
