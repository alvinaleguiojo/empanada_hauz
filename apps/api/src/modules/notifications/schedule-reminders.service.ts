import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { NotificationsService } from "./notifications.service";

const ACTIVE_ORDER_STATUSES = [
  "inquiry",
  "awaiting_confirmation",
  "confirmed",
  "queued",
  "preparing",
  "frying",
  "packed",
  "ready_for_pickup",
  "ready_for_booking",
  "booked"
] as const;

@Injectable()
export class ScheduleRemindersService implements OnModuleInit, OnModuleDestroy {
  private intervalHandle: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    void this.scanAndNotify();
    this.intervalHandle = setInterval(() => {
      void this.scanAndNotify();
    }, this.getIntervalMs());
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private getIntervalMs() {
    return Number(this.config.get("SCHEDULE_REMINDER_INTERVAL_MS") ?? 60_000);
  }

  private getLookaheadMinutes() {
    return Number(this.config.get("SCHEDULE_REMINDER_LOOKAHEAD_MINUTES") ?? 30);
  }

  private getGraceMinutes() {
    return Number(this.config.get("SCHEDULE_REMINDER_GRACE_MINUTES") ?? 5);
  }

  private async scanAndNotify() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.getGraceMinutes() * 60_000);
      const lookahead = new Date(now.getTime() + this.getLookaheadMinutes() * 60_000);

      const dueOrders = await this.prisma.order.findMany({
        where: {
          preferredSchedule: {
            not: null,
            gte: windowStart,
            lte: lookahead
          },
          scheduleReminderSentAt: null,
          status: { in: [...ACTIVE_ORDER_STATUSES] }
        },
        include: {
          customer: true
        },
        orderBy: {
          preferredSchedule: "asc"
        }
      });

      for (const order of dueOrders) {
        const scheduledFor = order.preferredSchedule;
        if (!scheduledFor) {
          continue;
        }

        const minutesUntilSchedule = Math.max(0, Math.round((scheduledFor.getTime() - now.getTime()) / 60_000));

        await this.prisma.order.update({
          where: { id: order.id },
          data: { scheduleReminderSentAt: now }
        });

        this.notifications.notify("order.schedule_reminder", {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customer.name,
          deliveryMethod: order.deliveryMethod,
          paymentMethod: order.paymentMethod,
          status: order.status,
          scheduledFor: scheduledFor.toISOString(),
          minutesUntilSchedule
        });
      }
    } finally {
      this.running = false;
    }
  }
}
