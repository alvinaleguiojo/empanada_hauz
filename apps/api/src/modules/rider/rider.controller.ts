import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DELIVERY_JOB_STATUSES, DeliveryJobStatus } from "../delivery-network/dto";
import { RiderJobStatusDto, RiderLocationDto, RiderStatusDto } from "./dto";
import { RiderService } from "./rider.service";

type JwtUser = {
  sub: string;
  email: string;
  role: string;
};

@UseGuards(JwtAuthGuard)
@Controller("rider")
export class RiderController {
  constructor(private readonly riderService: RiderService) {}

  @Get("me")
  me(@Req() request: { user: JwtUser }) {
    return this.riderService.getProfile(request.user.sub);
  }

  @Get("jobs")
  jobs(@Req() request: { user: JwtUser }, @Query("status") status?: DeliveryJobStatus) {
    const normalizedStatus = DELIVERY_JOB_STATUSES.includes(status as DeliveryJobStatus) ? status : undefined;
    return this.riderService.listJobs(request.user.sub, normalizedStatus);
  }

  @Patch("status")
  updateStatus(@Req() request: { user: JwtUser }, @Body() dto: RiderStatusDto) {
    return this.riderService.updateStatus(request.user.sub, dto);
  }

  @Post("location")
  updateLocation(@Req() request: { user: JwtUser }, @Body() dto: RiderLocationDto) {
    return this.riderService.updateLocation(request.user.sub, dto);
  }

  @Patch("jobs/:id/status")
  updateJobStatus(@Req() request: { user: JwtUser }, @Param("id") id: string, @Body() dto: RiderJobStatusDto) {
    return this.riderService.updateJobStatus(request.user.sub, id, dto);
  }
}
