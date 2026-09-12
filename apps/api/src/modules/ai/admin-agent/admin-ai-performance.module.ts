import { Module } from '@nestjs/common';
import { AdminAiPerformanceController } from './admin-ai-performance.controller';
import { AdminAiPerformanceService } from './admin-ai-performance.service';

@Module({
  controllers: [AdminAiPerformanceController],
  providers: [AdminAiPerformanceService],
  exports: [AdminAiPerformanceService],
})
export class AdminAiPerformanceModule {}
