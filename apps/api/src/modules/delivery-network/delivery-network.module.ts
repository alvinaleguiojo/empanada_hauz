import { Module } from "@nestjs/common";
import { DeliveryNetworkController } from "./delivery-network.controller";
import { DeliveryNetworkService } from "./delivery-network.service";

@Module({
  controllers: [DeliveryNetworkController],
  providers: [DeliveryNetworkService],
  exports: [DeliveryNetworkService]
})
export class DeliveryNetworkModule {}
