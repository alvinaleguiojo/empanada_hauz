import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  AssignDeliveryJobDto,
  CreateDeliveryJobDto,
  CreateDeliveryJobFromOrderDto,
  CreateRiderDto,
  DeliveryJobStatus,
  DELIVERY_JOB_STATUSES,
  QuoteDeliveryJobDto,
  UpdateDeliveryJobStatusDto,
  UpdateRiderLocationDto,
  UpdateRiderStatusDto
} from "./dto";
import { DeliveryNetworkService } from "./delivery-network.service";

@UseGuards(JwtAuthGuard)
@Controller("delivery-network")
export class DeliveryNetworkController {
  constructor(private readonly deliveryNetworkService: DeliveryNetworkService) {}

  @Get("riders")
  listRiders() {
    return this.deliveryNetworkService.listRiders();
  }

  @Post("riders")
  createRider(@Body() dto: CreateRiderDto) {
    return this.deliveryNetworkService.createRider(dto);
  }

  @Patch("riders/:id/status")
  updateRiderStatus(@Param("id") id: string, @Body() dto: UpdateRiderStatusDto) {
    return this.deliveryNetworkService.updateRiderStatus(id, dto);
  }

  @Post("riders/:id/location")
  updateRiderLocation(@Param("id") id: string, @Body() dto: UpdateRiderLocationDto) {
    return this.deliveryNetworkService.updateRiderLocation(id, dto);
  }

  @Get("jobs")
  listJobs(@Query("status") status?: DeliveryJobStatus) {
    const normalizedStatus = DELIVERY_JOB_STATUSES.includes(status as DeliveryJobStatus) ? status : undefined;
    return this.deliveryNetworkService.listJobs(normalizedStatus);
  }

  @Get("quote")
  quoteJob(@Query() dto: QuoteDeliveryJobDto) {
    return this.deliveryNetworkService.quoteJob(dto);
  }

  @Post("jobs")
  createJob(@Body() dto: CreateDeliveryJobDto) {
    return this.deliveryNetworkService.createJob(dto);
  }

  @Post("jobs/from-order")
  createJobFromOrder(@Body() dto: CreateDeliveryJobFromOrderDto) {
    return this.deliveryNetworkService.createJobFromOrder(dto);
  }

  @Patch("jobs/:id/assign")
  assignJob(@Param("id") id: string, @Body() dto: AssignDeliveryJobDto) {
    return this.deliveryNetworkService.assignJob(id, dto);
  }

  @Patch("jobs/:id/status")
  updateJobStatus(@Param("id") id: string, @Body() dto: UpdateDeliveryJobStatusDto) {
    return this.deliveryNetworkService.updateJobStatus(id, dto);
  }
}
