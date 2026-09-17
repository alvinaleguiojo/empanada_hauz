import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { GoogleWorkspaceService } from "../google-workspace/google-workspace.service";

const SYNC_INTERVAL_MS = 30_000;
const MAX_ORDERS_PER_RUN = 500;

export interface CalendarSyncRunResult {
  total: number;
  synced: number;
  deleted: number;
  skipped: number;
  failed: number;
  errors: Array<{ orderId: string; error: string }>;
}

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
    this.logger.log(`Automatic Google Calendar sync enabled (every ${SYNC_INTERVAL_MS / 1000}s)`);
    void this.sync("startup");
    this.timer = setInterval(() => void this.sync("interval"), SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.logger.log("Automatic Google Calendar sync stopped");
  }

  async syncFutureOrders(): Promise<CalendarSyncRunResult> {
    return this.sync("manual", true);
  }

  private async sync(source: "startup" | "interval" | "manual", futureOnly = false): Promise<CalendarSyncRunResult> {
    const empty: CalendarSyncRunResult = { total: 0, synced: 0, deleted: 0, skipped: 0, failed: 0, errors: [] };

    if (this.running) {
      this.logger.warn(`Google Calendar sync skipped (${source}): another sync is already running`);
      return empty;
    }

    this.running = true;
    const startedAt = Date.now();

    try {
      this.logger.log(`Google Calendar sync started (${source})`);

      const status = await this.googleWorkspace.status();
      this.logger.log(`Google Calendar connection status: connected=${status.connected}${status.email ? ` email=${status.email}` : ""}`);

      if (!status.connected) {
        this.logger.warn(`Google Calendar sync skipped (${source}): Google account is not connected`);
        return empty;
      }

      const now = new Date();
      const since = futureOnly ? undefined : this.lastSyncAt;
      const where = futureOnly
        ? { preferredSchedule: { gte: now }, status: { notIn: ["cancelled", "completed"] } }
        : since
          ? { updatedAt: { gte: since } }
          : { preferredSchedule: { not: null } };

      const orders = await this.prisma.order.findMany({
        where,
        select: { id: true, status: true, preferredSchedule: true },
        orderBy: { updatedAt: "asc" },
        take: MAX_ORDERS_PER_RUN
      });

      this.logger.log(`Google Calendar sync found ${orders.length} order(s) (${source})`);

      const result: CalendarSyncRunResult = { ...empty };
      result.total = orders.length;

      for (const order of orders) {
        try {
          if (!order.preferredSchedule || ["cancelled", "completed"].includes(order.status)) {
            await this.googleWorkspace.deleteOrderEvent(order.id);
            result.deleted += 1;
            this.logger.log(`Calendar event removed for order ${order.id}`);
          } else {
            const syncResult = await this.googleWorkspace.syncOrder(order.id);
            if (syncResult.synced) {
              result.synced += 1;
              this.logger.log(`Calendar event synced for order ${order.id}${syncResult.eventId ? ` event=${syncResult.eventId}` : ""}`);
            } else {
              result.skipped += 1;
              this.logger.warn(`Calendar sync skipped for order ${order.id}: ${syncResult.reason ?? "unknown reason"}`);
            }
          }
        } catch (error) {
          const message = this.formatError(error);
          result.failed += 1;
          result.errors.push({ orderId: order.id, error: message });
          this.logger.error(`Calendar sync failed for order ${order.id}: ${message}`);
        }
      }

      if (source !== "manual") this.lastSyncAt = new Date();

      this.logger.log(
        `Google Calendar sync complete (${source}): total=${result.total} synced=${result.synced} deleted=${result.deleted} skipped=${result.skipped} failed=${result.failed} durationMs=${Date.now() - startedAt}`
      );
      return result;
    } catch (error) {
      const message = this.formatError(error);
      this.logger.error(`Google Calendar sync failed (${source}): ${message}`);
      return { ...empty, failed: 1, errors: [{ orderId: "*", error: message }] };
    } finally {
      this.running = false;
    }
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
