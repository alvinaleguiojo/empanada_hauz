import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    this.$use(async (params, next) => {
      const result = await next(params);

      // Keep referral records synchronized with their source order whenever
      // an application-level order status changes.
      if (params.model === "Order" && params.action === "update") {
        const orderId = params.args?.where?.id;
        const status = params.args?.data?.status;
        if (typeof orderId === "string" && typeof status === "string") {
          await this.referral.updateMany({
            where: { orderId },
            data: { status }
          });
        }
      }

      return result;
    });

    // Repair any referral records that became stale before this synchronization
    // was added. This runs once when the API starts and is idempotent.
    const referrals = await this.referral.findMany({
      where: { orderId: { not: null } },
      select: { id: true, orderId: true, status: true }
    });
    const orderIds = referrals.map((referral) => referral.orderId).filter((id): id is string => Boolean(id));

    if (orderIds.length) {
      const orders = await this.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, status: true }
      });
      const statusByOrderId = new Map(orders.map((order) => [order.id, order.status]));

      await Promise.all(
        referrals
          .filter((referral) => referral.orderId && statusByOrderId.get(referral.orderId) && statusByOrderId.get(referral.orderId) !== referral.status)
          .map((referral) => this.referral.update({
            where: { id: referral.id },
            data: { status: statusByOrderId.get(referral.orderId!) }
          }))
      );
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on("beforeExit", async () => {
      await app.close();
    });
  }
}
