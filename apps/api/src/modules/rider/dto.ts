import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, Max, Min } from "class-validator";
import { DELIVERY_JOB_STATUSES, DeliveryJobStatus, RIDER_STATUSES, RiderStatus } from "../delivery-network/dto";

export class RiderStatusDto {
  @IsIn(RIDER_STATUSES)
  status!: RiderStatus;
}

export class RiderLocationDto {
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;
}

export class RiderJobStatusDto {
  @IsIn(DELIVERY_JOB_STATUSES)
  status!: DeliveryJobStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  finalFare?: number;
}

export class RiderRouteQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLng!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  destLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  destLng!: number;
}
