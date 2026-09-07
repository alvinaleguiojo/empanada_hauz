import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../../database/prisma.service";

export type AiActionConfigPatch = { enabled?: boolean; label?: string; description?: string };

export type AiActionConfigDocument = {
  _id: string;
  name: string;
  executor: string;
  enabled: boolean;
  label?: string;
  description?: string;
  custom?: boolean;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };
type MongoDeleteResult = { n?: number; deletedCount?: number };

@Injectable()
export class AiActionConfigService {
  private readonly collection = "ai_action_configs";
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AiActionConfigDocument[]> {
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, sort: { name: 1 }, limit: 500 })) as unknown as MongoFindResult<AiActionConfigDocument>;
    return result.cursor?.firstBatch ?? [];
  }

  async findByName(name: string): Promise<AiActionConfigDocument | null> {
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, filter: { name }, limit: 1 })) as unknown as MongoFindResult<AiActionConfigDocument>;
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  async upsert(name: string, patch: AiActionConfigPatch, createdById: string, defaults: { description: string; executor?: string }) {
    if (!name.trim()) throw new BadRequestException("Action name is required");
    if (patch.label !== undefined && patch.label.trim().length === 0) patch.label = name;
    if (patch.label !== undefined && patch.label.trim().length > 120) throw new BadRequestException("Action label must be 120 characters or less");
    if (patch.description !== undefined && patch.description.trim().length === 0) throw new BadRequestException("Action description cannot be empty");
    if (patch.description !== undefined && patch.description.trim().length > 2000) throw new BadRequestException("Action description must be 2,000 characters or less");
    const existing = await this.findByName(name);
    const now = new Date();
    if (!existing) {
      const document: AiActionConfigDocument = {
        _id: randomUUID(), name, executor: defaults.executor ?? name, enabled: patch.enabled ?? true,
        label: patch.label?.trim() || name, description: patch.description?.trim() || defaults.description,
        custom: false, createdById, createdAt: now, updatedAt: now
      };
      await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
      return document;
    }
    const $set: Record<string, unknown> = { updatedAt: now };
    if (patch.enabled !== undefined) $set.enabled = patch.enabled;
    if (patch.label !== undefined) $set.label = patch.label.trim();
    if (patch.description !== undefined) $set.description = patch.description.trim();
    await this.prisma.$runCommandRaw({ update: this.collection, updates: [{ q: { name }, u: { $set: $set as Prisma.InputJsonObject }, upsert: false, multi: false }] });
    const updated = await this.findByName(name);
    if (!updated) throw new NotFoundException("AI action configuration not found");
    return updated;
  }

  async createCustom(input: { name: string; label: string; description: string; executor: string; enabled?: boolean }, createdById: string) {
    const name = input.name.trim();
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(name)) throw new BadRequestException("Action name must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.");
    if (input.label.trim().length < 1 || input.label.trim().length > 120) throw new BadRequestException("Action label must be between 1 and 120 characters");
    if (input.description.trim().length < 1 || input.description.trim().length > 2000) throw new BadRequestException("Action description must be between 1 and 2,000 characters");
    if (!input.executor.trim()) throw new BadRequestException("An approved executor is required");
    if (await this.findByName(name)) throw new BadRequestException(`AI action already exists: ${name}`);
    const now = new Date();
    const document: AiActionConfigDocument = {
      _id: randomUUID(), name, executor: input.executor.trim(), enabled: input.enabled ?? true,
      label: input.label.trim(), description: input.description.trim(), custom: true,
      createdById, createdAt: now, updatedAt: now
    };
    await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    return document;
  }

  async remove(name: string) {
    const result = (await this.prisma.$runCommandRaw({ delete: this.collection, deletes: [{ q: { name }, limit: 1 }] })) as unknown as MongoDeleteResult;
    if ((result.deletedCount ?? result.n ?? 0) === 0) throw new NotFoundException("AI action configuration not found");
  }
}
