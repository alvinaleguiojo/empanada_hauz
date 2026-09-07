import { Module } from "@nestjs/common";
import { DeliveryNetworkController } from "./delivery-network.controller";
import { DeliveryNetworkService } from "./delivery-network.service";
import { MapsService } from "./maps.service";

@Module({
  controllers: [DeliveryNetworkController],
  providers: [DeliveryNetworkService, MapsService],
  exports: [DeliveryNetworkService, MapsService]
})
export class DeliveryNetworkModule {}
