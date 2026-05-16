import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

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
