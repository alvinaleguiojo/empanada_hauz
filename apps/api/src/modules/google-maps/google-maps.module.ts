import { Module } from "@nestjs/common";
import { GoogleMapsController } from "./google-maps.controller";

@Module({
  controllers: [GoogleMapsController]
})
export class GoogleMapsModule {}
