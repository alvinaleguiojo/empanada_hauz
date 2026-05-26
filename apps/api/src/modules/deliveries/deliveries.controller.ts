import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateManualDeliveryDto, UpdateDeliveryTrackingDto } from "./dto";
import { DeliveriesService } from "./deliveries.service";

@UseGuards(JwtAuthGuard)
@Controller("deliveries")
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get("queue")
  listQueue() {
    return this.deliveriesService.listQueue();
  }

  @Get("grouped")
  grouped() {
    return this.deliveriesService.groupByArea();
  }

  @Post("manual")
  createManual(@Body() dto: CreateManualDeliveryDto) {
    return this.deliveriesService.createManual(dto);
  }

  @Patch("orders/:orderId")
  updateTracking(@Param("orderId") orderId: string, @Body() dto: UpdateDeliveryTrackingDto) {
    return this.deliveriesService.updateTracking(orderId, dto);
  }
}
