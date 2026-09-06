import { Module } from "@nestjs/common";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { AiDeliveryFeeContextService } from "./ai-delivery-fee-context.service";
import { AiService } from "./ai.service";

@Module({
  imports: [DeliveryNetworkModule],
  providers: [AiService, AiDeliveryFeeContextService],
  exports: [AiService]
})
export class AiModule {}
