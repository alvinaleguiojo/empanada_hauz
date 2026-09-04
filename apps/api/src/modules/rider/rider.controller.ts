import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DELIVERY_JOB_STATUSES, DeliveryJobStatus } from "../delivery-network/dto";
import { RiderJobStatusDto, RiderLocationDto, RiderRouteQueryDto, RiderStatusDto } from "./dto";
import { RiderService } from "./rider.service";

type JwtUser = {
  sub: string;
  email: string;
  role: string;
};

function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([longitude / 1e5, latitude / 1e5]);
  }

  return coordinates;
}

function durationSeconds(duration: string): number {
  const match = duration.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Number(match[1]) : 0;
}

@UseGuards(JwtAuthGuard)
@Controller("rider")
export class RiderController {
  constructor(private readonly riderService: RiderService) {}

  @Get("me")
  me(@Req() request: { user: JwtUser }) {
    return this.riderService.getProfile(request.user.sub);
  }

  @Get("route")
  async route(@Query() dto: RiderRouteQueryDto) {
    const result = await this.riderService.route(dto);
    const duration = durationSeconds(result.duration);
    const coordinates = decodePolyline(result.polyline);

    return {
      ...result,
      routes: [
        {
          distance: result.distanceMeters,
          duration,
          geometry: { coordinates }
        }
      ]
    };
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
