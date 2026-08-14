import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    this.$use(async (params, next) => {
      const result = await next(params);

      // Referral records mirror the source order's status. Keep that mirror
      // synchronized whenever an application-level order update changes the
      // status, so referral dashboards never show a stale status.
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

    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on("beforeExit", async () => {
      await app.close();
    });
  }
}
