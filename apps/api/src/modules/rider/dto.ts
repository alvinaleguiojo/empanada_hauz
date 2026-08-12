import { IsIn, IsNumber, IsOptional, Min } from "class-validator";
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
