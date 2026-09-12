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
    const now = new Date();
    const exact = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { adminId, conversationId, status: "pending", expiresAt: { $gt: now } },
      sort: { createdAt: -1 },
      limit: 1
    })) as unknown as MongoFindResult<AiAdminPendingAction>;
    const exactPending = exact.cursor?.firstBatch?.[0];
    if (exactPending) return exactPending;

    // The admin UI may create a fresh conversation id for each message.
    // Keep confirmation state scoped to the authenticated admin and recover
    // the latest unexpired pending action when the exact conversation differs.
    const latest = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { adminId, status: "pending", expiresAt: { $gt: now } },
      sort: { createdAt: -1 },
      limit: 1
    })) as unknown as MongoFindResult<AiAdminPendingAction>;
    return latest.cursor?.firstBatch?.[0] ?? null;
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

    // Only one pending consequential action is allowed per administrator.
    // This prevents an old confirmation from colliding with a newer request
    // when the client changes conversation ids between messages.
    await this.prisma.$runCommandRaw({
      delete: this.collection,
      deletes: [{ q: { adminId, status: "pending" }, limit: 0 }]
    } as unknown as Prisma.InputJsonObject);

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
    if (!adminId) return { ok: true };
    const command = {
      delete: this.collection,
      deletes: [{ q: { adminId, status: "pending" }, limit: 0 }]
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
