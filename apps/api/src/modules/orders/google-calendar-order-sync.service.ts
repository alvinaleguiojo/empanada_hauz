import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { GoogleWorkspaceService } from "../google-workspace/google-workspace.service";

const SYNC_INTERVAL_MS = 30_000;
const MAX_ORDERS_PER_RUN = 500;
const CLOSED_ORDER_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

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
    const empty: CalendarSyncRunResult = {
      total: 0,
      synced: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    if (this.running) {
      this.logger.warn(`Google Calendar sync skipped (${source}): another sync is already running`);
      return empty;
    }

    this.running = true;
    const startedAt = Date.now();

    try {

      const status = await this.googleWorkspace.status();

      if (!status.connected) {
        this.logger.warn(`Google Calendar sync skipped (${source}): Google account is not connected`);
        return empty;
      }

      const now = new Date();
      const activeWhere: Prisma.OrderWhereInput = {
        preferredSchedule: { gte: now },
        status: { notIn: ["cancelled", "completed"] }
      };

      const activeOrders = await this.prisma.order.findMany({
        where: activeWhere,
        select: { id: true, status: true, preferredSchedule: true },
        orderBy: { preferredSchedule: "asc" },
        take: MAX_ORDERS_PER_RUN
      });

      const result: CalendarSyncRunResult = { ...empty, total: activeOrders.length };

      for (const order of activeOrders) {
        await this.syncActiveOrder(order.id, result);
      }

      // Manual sync is intentionally limited to future active orders. Automatic
      // runs also remove Calendar events for recently completed/cancelled orders.
      if (!futureOnly) {
        const closedWhere: Prisma.OrderWhereInput = {
          preferredSchedule: { not: null },
          status: { in: ["cancelled", "completed"] },
          updatedAt: { gte: new Date(Date.now() - CLOSED_ORDER_LOOKBACK_MS) }
        };

        const closedOrders = await this.prisma.order.findMany({
          where: closedWhere,
          select: { id: true },
          orderBy: { updatedAt: "desc" },
          take: MAX_ORDERS_PER_RUN
        });

        result.total += closedOrders.length;

        for (const order of closedOrders) {
          try {
            const deleteResult = await this.googleWorkspace.deleteOrderEvent(order.id);
            if (deleteResult.deleted) result.deleted += 1;
          } catch (error) {
            const message = this.formatError(error);
            result.failed += 1;
            result.errors.push({ orderId: order.id, error: message });
            this.logger.error(`Calendar cleanup failed for order ${order.id}: ${message}`);
          }
        }
      }

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

  private async syncActiveOrder(orderId: string, result: CalendarSyncRunResult) {
    try {
      const syncResult = await this.googleWorkspace.syncOrder(orderId);

      if (syncResult.synced) {
        result.synced += 1;
        return;
      }

      result.skipped += 1;
      this.logger.warn(
        `Calendar sync skipped for order ${orderId}: ${syncResult.reason ?? "unknown reason"}`
      );
    } catch (error) {
      const message = this.formatError(error);
      result.failed += 1;
      result.errors.push({ orderId, error: message });
      this.logger.error(`Calendar sync failed for order ${orderId}: ${message}`);
    }
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
