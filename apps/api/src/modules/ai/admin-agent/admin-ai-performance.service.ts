import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

interface PerformanceContext {
  requestId: string;
  startedAt: bigint;
  adminId?: string;
  model?: string;
  llmMs: number;
  toolMs: number;
  toolCalls: number;
  iterations: number;
  tools: Array<{ name: string; durationMs: number }>;
}

interface MongoFindResult<T> {
  cursor?: { firstBatch?: T[] };
}

@Injectable()
export class AdminAiPerformanceService {
  private readonly collection = 'admin_ai_performance_metrics';

  constructor(private readonly prisma: PrismaService) {}

  start(adminId?: string, model?: string): PerformanceContext {
    return {
      requestId: require('crypto').randomUUID(),
      startedAt: process.hrtime.bigint(),
      adminId,
      model,
      llmMs: 0,
      toolMs: 0,
      toolCalls: 0,
      iterations: 0,
      tools: [],
    };
  }

  recordLlm(context: PerformanceContext, durationMs: number) {
    context.llmMs += durationMs;
  }

  recordIteration(context: PerformanceContext) {
    context.iterations += 1;
  }

  recordTool(context: PerformanceContext, name: string, durationMs: number) {
    context.toolMs += durationMs;
    context.toolCalls += 1;
    context.tools.push({ name, durationMs });
  }

  async finish(context: PerformanceContext) {
    const totalMs = Number(process.hrtime.bigint() - context.startedAt) / 1_000_000;
    const document = {
      requestId: context.requestId,
      adminId: context.adminId ?? null,
      model: context.model ?? null,
      totalMs: Math.round(totalMs),
      llmMs: Math.round(context.llmMs),
      toolMs: Math.round(context.toolMs),
      toolCalls: context.toolCalls,
      iterations: context.iterations,
      tools: context.tools.map((tool) => ({ ...tool, durationMs: Math.round(tool.durationMs) })),
      createdAt: new Date(),
    };

    await this.prisma.$runCommandRaw({
      insert: this.collection,
      documents: [document],
    });

    return document;
  }

  async list(limit = 100) {
    const result = await this.prisma.$runCommandRaw<MongoFindResult<Record<string, unknown>>>({
      find: this.collection,
      sort: { createdAt: -1 },
      limit: Math.min(Math.max(limit, 1), 1000),
    });
    return result.cursor?.firstBatch ?? [];
  }

  async summary() {
    const result = await this.prisma.$runCommandRaw<{
      cursor?: { firstBatch?: Array<{ count: number; averageMs: number; maxMs: number }> };
    }>({
      aggregate: this.collection,
      pipeline: [
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            averageMs: { $avg: '$totalMs' },
            maxMs: { $max: '$totalMs' },
          },
        },
      ],
      cursor: {},
    });

    const aggregate = result.cursor?.firstBatch?.[0];
    if (!aggregate) return { count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };

    const valuesResult = await this.prisma.$runCommandRaw<MongoFindResult<{ totalMs: number }>>({
      find: this.collection,
      projection: { _id: 0, totalMs: 1 },
      sort: { totalMs: 1 },
    });
    const values = (valuesResult.cursor?.firstBatch ?? []).map((item) => item.totalMs);
    const percentile = (p: number) => values.length
      ? values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)]
      : 0;

    return {
      count: aggregate.count,
      averageMs: Math.round(aggregate.averageMs ?? 0),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: aggregate.maxMs ?? 0,
    };
  }
}
