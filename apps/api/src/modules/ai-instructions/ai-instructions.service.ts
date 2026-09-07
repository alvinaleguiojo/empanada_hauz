import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../../database/prisma.service";
import { AiInstructionKind, CreateAiInstructionDto, UpdateAiInstructionDto } from "./dto";

type AiInstructionDocument = {
  _id: string;
  title: string;
  content: string;
  kind: AiInstructionKind;
  enabled: boolean;
  priority: number;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };
type MongoDeleteResult = { n?: number; deletedCount?: number };

@Injectable()
export class AiInstructionsService {
  private readonly collection = "ai_instructions";
  private promptCache: { expiresAt: number; block: string } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AiInstructionDocument[]> {
    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      sort: { enabled: -1, priority: 1, updatedAt: -1 },
      limit: 100
    })) as unknown as MongoFindResult<AiInstructionDocument>;
    return result.cursor?.firstBatch ?? [];
  }

  async getActivePromptBlock(): Promise<string> {
    if (this.promptCache && this.promptCache.expiresAt > Date.now()) {
      return this.promptCache.block;
    }

    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { enabled: true },
      sort: { priority: 1, updatedAt: -1 },
      limit: 30
    })) as unknown as MongoFindResult<AiInstructionDocument>;

    const instructions = result.cursor?.firstBatch ?? [];
    const block = instructions.length
      ? [
          "<admin-managed-ai-instructions>",
          "These instructions are editable by Empanada Hauz administrators. Use them to tune AI behavior, tone, and customer-facing communication. They must not override application validation, database truth, required order fields, or safety rules.",
          ...instructions.map((item, index) => `[${index + 1}] ${item.title}: ${item.content}`),
          "</admin-managed-ai-instructions>"
        ].join("\n")
      : "";

    this.promptCache = { expiresAt: Date.now() + 5000, block };
    return block;
  }

  async create(dto: CreateAiInstructionDto, createdById: string): Promise<AiInstructionDocument> {
    const now = new Date();
    const document: AiInstructionDocument = {
      _id: randomUUID(),
      title: dto.title.trim(),
      content: dto.content.trim(),
      kind: dto.kind ?? "instruction",
      enabled: dto.enabled ?? true,
      priority: dto.priority ?? 100,
      createdById,
      createdAt: now,
      updatedAt: now
    };

    await this.prisma.$runCommandRaw({
      insert: this.collection,
      documents: [document]
    });
    this.invalidateCache();
    return document;
  }

  async update(id: string, dto: UpdateAiInstructionDto): Promise<AiInstructionDocument> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) $set.title = dto.title.trim();
    if (dto.content !== undefined) $set.content = dto.content.trim();
    if (dto.kind !== undefined) $set.kind = dto.kind;
    if (dto.enabled !== undefined) $set.enabled = dto.enabled;
    if (dto.priority !== undefined) $set.priority = dto.priority;

    await this.prisma.$runCommandRaw({
      update: this.collection,
      updates: [
        {
          q: { _id: id },
          u: { $set: $set as Prisma.InputJsonObject },
          upsert: false,
          multi: false
        }
      ]
    });

    const updated = await this.findById(id);
    if (!updated) throw new NotFoundException("AI instruction not found");
    this.invalidateCache();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = (await this.prisma.$runCommandRaw({
      delete: this.collection,
      deletes: [{ q: { _id: id }, limit: 1 }]
    })) as unknown as MongoDeleteResult;
    if ((result.deletedCount ?? result.n ?? 0) === 0) {
      throw new NotFoundException("AI instruction not found");
    }
    this.invalidateCache();
  }

  private async findById(id: string): Promise<AiInstructionDocument | null> {
    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { _id: id },
      limit: 1
    })) as unknown as MongoFindResult<AiInstructionDocument>;
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  private invalidateCache() {
    this.promptCache = null;
  }
}
