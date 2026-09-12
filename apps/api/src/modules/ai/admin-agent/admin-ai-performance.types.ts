export interface AdminAiToolTiming {
  name: string;
  durationMs: number;
}

export interface AdminAiPerformanceMetric {
  requestId: string;
  adminId?: string;
  model?: string;
  totalMs: number;
  llmMs: number;
  toolMs: number;
  toolCalls: number;
  iterations: number;
  tools: AdminAiToolTiming[];
  createdAt: string;
}
