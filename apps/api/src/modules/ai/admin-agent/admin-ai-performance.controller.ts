import { Controller, Get, Query } from '@nestjs/common';
import { AdminAiPerformanceService } from './admin-ai-performance.service';

@Controller('ai/admin/performance')
export class AdminAiPerformanceController {
  constructor(private readonly performance: AdminAiPerformanceService) {}

  @Get('summary')
  summary() {
    return this.performance.summary();
  }

  @Get()
  list(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '100', 10);
    return this.performance.list(Number.isFinite(parsed) ? parsed : 100);
  }
}
