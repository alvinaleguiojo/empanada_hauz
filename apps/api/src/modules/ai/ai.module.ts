import { Module } from "@nestjs/common";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { McpModule } from "../mcp/mcp.module";
import { AiDeliveryFeeContextService } from "./ai-delivery-fee-context.service";
import { AiOrderNormalizationService } from "./ai-order-normalization.service";
import { AiOrderStatusContextService } from "./ai-order-status-context.service";
import { AiService } from "./ai.service";

@Module({
  imports: [DeliveryNetworkModule, McpModule],
  providers: [AiService, AiDeliveryFeeContextService, AiOrderStatusContextService, AiOrderNormalizationService],
  exports: [AiService]
})
export class AiModule {}
