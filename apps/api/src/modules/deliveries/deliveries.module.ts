import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { DeliveriesController } from "./deliveries.controller";
import { DeliveriesService } from "./deliveries.service";

@Module({
  imports: [OrdersModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService]
})
export class DeliveriesModule {}
