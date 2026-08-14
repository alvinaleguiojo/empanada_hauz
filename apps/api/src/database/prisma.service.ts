import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    // Repair any referral records that became stale before referral/order
    // synchronization was added. This is idempotent and safe to run on every
    // API startup.
    const referrals = await this.referral.findMany({
      where: { orderId: { not: null } },
      select: { id: true, orderId: true, status: true }
    });
    const orderIds = referrals
      .map((referral) => referral.orderId)
      .filter((id): id is string => Boolean(id));

    if (orderIds.length) {
      const orders = await this.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, status: true }
      });
      const statusByOrderId = new Map(orders.map((order) => [order.id, order.status]));

      await Promise.all(
        referrals
          .filter((referral) => {
            const orderStatus = referral.orderId ? statusByOrderId.get(referral.orderId) : undefined;
            return Boolean(orderStatus && orderStatus !== referral.status);
          })
          .map((referral) => {
            const status = statusByOrderId.get(referral.orderId!);
            return this.referral.update({
              where: { id: referral.id },
              data: { status }
            });
          })
      );
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on("beforeExit", async () => {
      await app.close();
    });
  }
}
