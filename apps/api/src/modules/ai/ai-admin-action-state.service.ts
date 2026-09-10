import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export interface AiAdminPendingAction {
  _id: string;
  adminId: string;
  conversationId: string;
  action: string;
  arguments: Record<string, unknown>;
  fingerprint: string;
  status: "pending";
  createdAt: Date;
  expiresAt: Date;
}

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };

@Injectable()
export class AiAdminActionStateService {
  private readonly collection = "ai_admin_action_states";
  private readonly ttlMs = 10 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async get(adminId: string, conversationId: string) {
    this.assertContext(adminId, conversationId);
    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { adminId, conversationId, status: "pending", expiresAt: { $gt: new Date() } },
      sort: { createdAt: -1 },
      limit: 1
    })) as unknown as MongoFindResult<AiAdminPendingAction>;
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  async save(adminId: string, conversationId: string, action: string, args: Record<string, unknown>, fingerprint: string) {
    this.assertContext(adminId, conversationId);
    if (!action || !fingerprint) throw new BadRequestException("Unable to create a pending admin action.");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const id = `${adminId}:${conversationId}`;
    const pending: AiAdminPendingAction = {
      _id: id,
      adminId,
      conversationId,
      action,
      arguments: args,
      fingerprint,
      status: "pending",
      createdAt: now,
      expiresAt
    };
    const command = {
      update: this.collection,
      updates: [{
        q: { _id: id },
        u: {
          $set: {
            adminId,
            conversationId,
            action,
            arguments: args as Prisma.InputJsonValue,
            fingerprint,
            status: "pending",
            createdAt: now,
            expiresAt
          }
        },
        upsert: true,
        multi: false
      }]
    } as unknown as Prisma.InputJsonObject;
    await this.prisma.$runCommandRaw(command);
    return pending;
  }

  async clear(adminId: string, conversationId: string) {
    if (!adminId || !conversationId) return { ok: true };
    const command = {
      delete: this.collection,
      deletes: [{ q: { adminId, conversationId }, limit: 1 }]
    } as unknown as Prisma.InputJsonObject;
    await this.prisma.$runCommandRaw(command);
    return { ok: true };
  }

  private assertContext(adminId: string, conversationId: string) {
    if (!adminId || !conversationId) {
      throw new BadRequestException("Admin and conversation context are required.");
    }
  }
}
