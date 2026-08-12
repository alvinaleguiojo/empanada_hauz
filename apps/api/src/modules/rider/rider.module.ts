import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { RealtimeModule } from "../../common/realtime.module";
import { RiderController } from "./rider.controller";
import { RiderService } from "./rider.service";

@Module({
  imports: [DatabaseModule, RealtimeModule],
  controllers: [RiderController],
  providers: [RiderService]
})
export class RiderModule {}
