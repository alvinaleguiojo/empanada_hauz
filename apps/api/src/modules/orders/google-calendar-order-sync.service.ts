import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { GoogleWorkspaceService } from "../google-workspace/google-workspace.service";

const SYNC_INTERVAL_MS = 30_000;

@Injectable()
export class GoogleCalendarOrderSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleCalendarOrderSyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastSyncAt?: Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleWorkspace: GoogleWorkspaceService
  ) {}

  onModuleInit() {
    void this.sync();
    this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sync() {
    if (this.running) return;
    this.running = true;

    try {
      const status = await this.googleWorkspace.status();
      if (!status.connected) return;

      const since = this.lastSyncAt;
      const updatedFilter = since ? { gte: since } : undefined;

      const orders = await this.prisma.order.findMany({
        where: updatedFilter ? { updatedAt: updatedFilter } : undefined,
        select: { id: true, status: true, preferredSchedule: true },
        orderBy: { updatedAt: "asc" },
        take: 500
      });

      for (const order of orders) {
        try {
          if (!order.preferredSchedule || ["cancelled", "completed"].includes(order.status)) {
            await this.googleWorkspace.deleteOrderEvent(order.id);
          } else {
            await this.googleWorkspace.syncOrder(order.id);
          }
        } catch (error) {
          this.logger.warn(`Unable to sync order ${order.id} to Google Calendar: ${this.formatError(error)}`);
        }
      }

      this.lastSyncAt = new Date();
    } catch (error) {
      this.logger.warn(`Google Calendar automatic sync skipped: ${this.formatError(error)}`);
    } finally {
      this.running = false;
    }
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
