import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AiOrderActionService } from "../ai/ai-order-action.service";
import { AiService } from "../ai/ai.service";
import { CustomersModule } from "../customers/customers.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";
import { McpModule } from "../mcp/mcp.module";
import { MessengerController } from "./messenger.controller";
import { MessengerService } from "./messenger.service";
import { MetaAuthService } from "./meta-auth.service";
import { MessengerOrderSummaryService } from "./messenger-order-summary.service";
import { MessengerSyncService } from "./messenger-sync.service";
import { MessengerSingleCallAiService } from "./messenger-single-call-ai.service";

@Module({
  imports: [AiModule, CustomersModule, OrdersModule, McpModule, NotificationsModule],
  controllers: [MessengerController],
  providers: [
    MessengerService,
    MessengerOrderSummaryService,
    MetaAuthService,
    MessengerSyncService,
    MessengerSingleCallAiService,
    { provide: AiService, useExisting: MessengerSingleCallAiService },
    { provide: AiOrderActionService, useExisting: MessengerSingleCallAiService }
  ],
  exports: [MessengerService, MetaAuthService]
})
export class MessengerModule {}
