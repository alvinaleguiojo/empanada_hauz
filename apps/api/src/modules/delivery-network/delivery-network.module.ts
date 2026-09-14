import { Module } from "@nestjs/common";
import { FraudModule } from "../fraud/fraud.module";
import { DeliveryNetworkController } from "./delivery-network.controller";
import { DeliveryNetworkService } from "./delivery-network.service";
import { MapsService } from "./maps.service";

@Module({
  imports: [FraudModule],
  controllers: [DeliveryNetworkController],
  providers: [DeliveryNetworkService, MapsService],
  exports: [DeliveryNetworkService, MapsService]
})
export class DeliveryNetworkModule {}
