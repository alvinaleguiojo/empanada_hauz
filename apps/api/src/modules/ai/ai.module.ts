import { Module } from "@nestjs/common";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { DatabaseModule } from "../../database/database.module";
import { McpModule } from "../mcp/mcp.module";
import { AiContextGuardService } from "./ai-context-guard.service";
import { AiControlService } from "./ai-control.service";
import { AiDeliveryFeeContextService } from "./ai-delivery-fee-context.service";
import { AiOrderActionService } from "./ai-order-action.service";
import { AiOrderNormalizationService } from "./ai-order-normalization.service";
import { AiOrderRescheduleService } from "./ai-order-reschedule.service";
import { AiService } from "./ai.service";

@Module({
  imports: [DatabaseModule, DeliveryNetworkModule, McpModule],
  providers: [AiService, AiControlService, AiContextGuardService, AiDeliveryFeeContextService, AiOrderActionService, AiOrderRescheduleService, AiOrderNormalizationService],
  exports: [AiService, AiControlService, AiOrderActionService]
})
export class AiModule {}
