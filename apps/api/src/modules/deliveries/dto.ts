import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateManualDeliveryDto {
  @IsString()
  customerName!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsString()
  address!: string;

  @IsOptional()
  @IsString()
  areaGroup?: string;

  @Min(1)
  @IsNumber()
  quantity!: number;

  @Min(0)
  @IsNumber()
  totalAmount!: number;

  @Min(0)
  @IsOptional()
  @IsNumber()
  deliveryFee?: number;

  @IsOptional()
  @IsDateString()
  preferredSchedule?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDeliveryTrackingDto {
  @IsOptional()
  @IsIn(["pending", "grouped", "ready_for_booking", "booked", "completed", "cancelled"])
  status?: "pending" | "grouped" | "ready_for_booking" | "booked" | "completed" | "cancelled";

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  eta?: string;

  @IsOptional()
  @IsString()
  trackingLink?: string;

  @IsOptional()
  @IsString()
  riderName?: string;

  @IsOptional()
  @IsString()
  riderPlate?: string;

  @IsOptional()
  @IsString()
  bookingNotes?: string;
}
