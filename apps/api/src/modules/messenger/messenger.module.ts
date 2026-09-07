import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AiInstructionsModule } from "../ai-instructions/ai-instructions.module";
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
import { MessengerSingleCallAiPolicyService } from "./messenger-single-call-ai-policy.service";

@Module({
  imports: [AiModule, AiInstructionsModule, CustomersModule, OrdersModule, McpModule, NotificationsModule],
  controllers: [MessengerController],
  providers: [
    MessengerService,
    MessengerOrderSummaryService,
    MetaAuthService,
    MessengerSyncService,
    MessengerSingleCallAiService,
    MessengerSingleCallAiPolicyService,
    { provide: AiService, useExisting: MessengerSingleCallAiPolicyService },
    { provide: AiOrderActionService, useExisting: MessengerSingleCallAiPolicyService }
  ],
  exports: [MessengerService, MetaAuthService]
})
export class MessengerModule {}
