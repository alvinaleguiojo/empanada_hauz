import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeGateway } from "../../common/realtime.gateway";
import { BatchName, CreateBatchDto } from "./dto";

@Injectable()
export class BatchesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway
  ) {}

  async onModuleInit() {
    await this.ensureDefaultBatches();
  }

  list() {
    return this.prisma.batch.findMany({
      include: { orders: true },
      orderBy: [{ batchDate: "desc" }, { name: "asc" }]
    });
  }

  async create(dto: CreateBatchDto) {
    const batch = await this.prisma.batch.create({
      data: {
        name: dto.name,
        batchDate: new Date(),
        maxCapacity: dto.maxCapacity,
        remainingCapacity: dto.maxCapacity,
        cutoffTime: new Date(dto.cutoffTime),
        estimatedCompletionTime: new Date(dto.estimatedCompletionTime)
      }
    });

    this.realtime.emit("batches.updated", batch);
    return batch;
  }

  async assignBatch(quantity: number) {
    const batch = await this.prisma.batch.findFirst({
      where: {
        isClosed: false,
        remainingCapacity: { gte: quantity }
      },
      orderBy: [{ batchDate: "asc" }, { name: "asc" }]
    });

    if (!batch) {
      return null;
    }

    const updated = await this.prisma.batch.update({
      where: { id: batch.id },
      data: {
        currentCapacity: { increment: quantity },
        remainingCapacity: { decrement: quantity },
        isClosed: batch.remainingCapacity - quantity <= 0
      }
    });

    this.realtime.emit("batches.updated", updated);
    return updated;
  }

  async ensureDefaultBatches() {
    const today = new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(today);
    dayEnd.setHours(23, 59, 59, 999);

    const existing = await this.prisma.batch.count({
      where: {
        batchDate: {
          gte: dayStart,
          lte: dayEnd
        }
      }
    });

    if (existing > 0) {
      return;
    }

    const defaults: Array<{ name: BatchName; cutoffHour: number; completionHour: number }> = [
      { name: "morning", cutoffHour: 9, completionHour: 12 },
      { name: "afternoon", cutoffHour: 14, completionHour: 17 }
    ];

    for (const item of defaults) {
      const batchDate = new Date();
      const cutoffTime = new Date();
      cutoffTime.setHours(item.cutoffHour, 0, 0, 0);
      const estimatedCompletionTime = new Date();
      estimatedCompletionTime.setHours(item.completionHour, 0, 0, 0);

      await this.prisma.batch.create({
        data: {
          name: item.name,
          batchDate,
          maxCapacity: 250,
          remainingCapacity: 250,
          cutoffTime,
          estimatedCompletionTime
        }
      });
    }
  }
}
