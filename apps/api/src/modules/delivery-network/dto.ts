import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

export const RIDER_STATUSES = ["offline", "online", "busy", "suspended"] as const;
export const VEHICLE_TYPES = ["motorcycle", "bicycle", "car"] as const;
export const DELIVERY_JOB_STATUSES = [
  "requested",
  "searching_rider",
  "assigned",
  "accepted",
  "pickup_started",
  "picked_up",
  "delivering",
  "delivered",
  "cancelled"
] as const;

export type RiderStatus = (typeof RIDER_STATUSES)[number];
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export type DeliveryJobStatus = (typeof DELIVERY_JOB_STATUSES)[number];

export class CreateRiderDto {
  @IsString()
  name!: string;

  @IsString()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  serviceArea?: string;

  @IsOptional()
  @IsIn(VEHICLE_TYPES)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsString()
  plateNumber?: string;

  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  vehicleColor?: string;
}

export class UpdateRiderStatusDto {
  @IsIn(RIDER_STATUSES)
  status!: RiderStatus;
}

export class UpdateRiderLocationDto {
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

export class CreateDeliveryJobDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  pickupAddress!: string;

  @IsOptional()
  @IsNumber()
  pickupLatitude?: number;

  @IsOptional()
  @IsNumber()
  pickupLongitude?: number;

  @IsString()
  dropoffAddress!: string;

  @IsOptional()
  @IsNumber()
  dropoffLatitude?: number;

  @IsOptional()
  @IsNumber()
  dropoffLongitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedFare?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateDeliveryJobFromOrderDto {
  @IsString()
  orderId!: string;

  @IsString()
  pickupAddress!: string;

  @IsOptional()
  @IsNumber()
  pickupLatitude?: number;

  @IsOptional()
  @IsNumber()
  pickupLongitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedFare?: number;
}

export class AssignDeliveryJobDto {
  @IsString()
  riderId!: string;

  @IsOptional()
  @IsDateString()
  offerExpiresAt?: string;
}

export class UpdateDeliveryJobStatusDto {
  @IsIn(DELIVERY_JOB_STATUSES)
  status!: DeliveryJobStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  finalFare?: number;
}
