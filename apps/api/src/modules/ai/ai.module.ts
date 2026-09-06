import { Module } from "@nestjs/common";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { DatabaseModule } from "../../database/database.module";
import { McpModule } from "../mcp/mcp.module";
import { AiControlService } from "./ai-control.service";
import { AiContextGuardService } from "./ai-context-guard.service";
import { AiDeliveryFeeContextService } from "./ai-delivery-fee-context.service";
import { AiOrderNormalizationService } from "./ai-order-normalization.service";
import { AiOrderStatusContextService } from "./ai-order-status-context.service";
import { AiService } from "./ai.service";

@Module({
  imports: [DatabaseModule, DeliveryNetworkModule, McpModule],
  providers: [AiService, AiControlService, AiContextGuardService, AiDeliveryFeeContextService, AiOrderStatusContextService, AiOrderNormalizationService],
  exports: [AiService, AiControlService]
})
export class AiModule {}
