import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
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

  async syncFutureOrders(): Promise<CalendarSyncRunResult> {
    return this.sync(true);
  }

  private async sync(futureOnly = false): Promise<CalendarSyncRunResult> {
    const empty: CalendarSyncRunResult = {
      total: 0,
      synced: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    if (this.running) {
      return empty;
    }

    this.running = true;

    try {
      const status = await this.googleWorkspace.status();

      if (!status.connected) {
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
          }
        }
      }

      return result;
    } catch (error) {
      const message = this.formatError(error);
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
    } catch (error) {
      const message = this.formatError(error);
      result.failed += 1;
      result.errors.push({ orderId, error: message });
    }
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
