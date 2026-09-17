import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { GoogleWorkspaceService } from "../google-workspace/google-workspace.service";

const SYNC_INTERVAL_MS = 30_000;

@Injectable()
export class GoogleCalendarOrderSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleCalendarOrderSyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

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

      const scheduledOrders = await this.prisma.order.findMany({
        where: {
          preferredSchedule: { not: null },
          status: { notIn: ["cancelled", "completed"] }
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: 500
      });

      for (const order of scheduledOrders) {
        try {
          await this.googleWorkspace.syncOrder(order.id);
        } catch (error) {
          this.logger.warn(`Unable to sync order ${order.id} to Google Calendar: ${this.formatError(error)}`);
        }
      }

      const closedOrders = await this.prisma.order.findMany({
        where: {
          preferredSchedule: { not: null },
          status: { in: ["cancelled", "completed"] },
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: 500
      });

      for (const order of closedOrders) {
        try {
          await this.googleWorkspace.deleteOrderEvent(order.id);
        } catch (error) {
          this.logger.warn(`Unable to remove closed order ${order.id} from Google Calendar: ${this.formatError(error)}`);
        }
      }
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
