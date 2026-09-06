import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { CustomersModule } from "../customers/customers.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";
import { McpModule } from "../mcp/mcp.module";
import { MessengerController } from "./messenger.controller";
import { MessengerService } from "./messenger.service";
import { MetaAuthService } from "./meta-auth.service";
import { MessengerSyncService } from "./messenger-sync.service";

@Module({
  imports: [AiModule, CustomersModule, OrdersModule, McpModule, NotificationsModule],
  controllers: [MessengerController],
  providers: [MessengerService, MetaAuthService, MessengerSyncService],
  exports: [MessengerService, MetaAuthService]
})
export class MessengerModule {}
