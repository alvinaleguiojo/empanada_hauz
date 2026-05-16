import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MESSENGER_QUEUE } from "../../common/enums";
import { AiModule } from "../ai/ai.module";
import { CustomersModule } from "../customers/customers.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";
import { MessengerController } from "./messenger.controller";
import { MessengerProcessor } from "./messenger.processor";
import { MessengerService } from "./messenger.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: MESSENGER_QUEUE }),
    AiModule,
    CustomersModule,
    OrdersModule,
    NotificationsModule
  ],
  controllers: [MessengerController],
  providers: [MessengerService, MessengerProcessor],
  exports: [MessengerService]
})
export class MessengerModule {}
