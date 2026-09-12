import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AdminAiPerformanceMetric } from './admin-ai-performance.types';

@Injectable()
export class AdminAiPerformanceService {
  private readonly metrics: AdminAiPerformanceMetric[] = [];
  private readonly maxMetrics = 1000;

  start(adminId?: string, model?: string) {
    const startedAt = process.hrtime.bigint();
    const requestId = randomUUID();
    return {
      requestId,
      startedAt,
      adminId,
      model,
      llmMs: 0,
      toolMs: 0,
      toolCalls: 0,
      iterations: 0,
      tools: [] as { name: string; durationMs: number }[],
    };
  }

  recordLlm(context: ReturnType<AdminAiPerformanceService['start']>, durationMs: number) {
    context.llmMs += durationMs;
  }

  recordIteration(context: ReturnType<AdminAiPerformanceService['start']>) {
    context.iterations += 1;
  }

  recordTool(context: ReturnType<AdminAiPerformanceService['start']>, name: string, durationMs: number) {
    context.toolMs += durationMs;
    context.toolCalls += 1;
    context.tools.push({ name, durationMs });
  }

  finish(context: ReturnType<AdminAiPerformanceService['start']>) {
    const totalMs = Number(process.hrtime.bigint() - context.startedAt) / 1_000_000;
    const metric: AdminAiPerformanceMetric = {
      requestId: context.requestId,
      adminId: context.adminId,
      model: context.model,
      totalMs: Math.round(totalMs),
      llmMs: Math.round(context.llmMs),
      toolMs: Math.round(context.toolMs),
      toolCalls: context.toolCalls,
      iterations: context.iterations,
      tools: context.tools.map((tool) => ({ ...tool, durationMs: Math.round(tool.durationMs) })),
      createdAt: new Date().toISOString(),
    };

    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) this.metrics.shift();
    return metric;
  }

  list(limit = 100) {
    return this.metrics.slice(-Math.min(limit, this.maxMetrics)).reverse();
  }

  summary() {
    const values = this.metrics.map((m) => m.totalMs).sort((a, b) => a - b);
    if (!values.length) return { count: 0, averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
    const percentile = (p: number) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
    return {
      count: values.length,
      averageMs: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: values[values.length - 1],
    };
  }
}
