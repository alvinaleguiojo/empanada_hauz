import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { CustomersModule } from "../customers/customers.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";
import { MessengerController } from "./messenger.controller";
import { MessengerService } from "./messenger.service";

@Module({
  imports: [AiModule, CustomersModule, OrdersModule, NotificationsModule],
  controllers: [MessengerController],
  providers: [MessengerService],
  exports: [MessengerService]
})
export class MessengerModule {}
