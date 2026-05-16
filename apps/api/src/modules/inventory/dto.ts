import { IsNumber, IsOptional, IsString } from "class-validator";

export class AdjustInventoryDto {
  @IsNumber()
  changeAmount!: number;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsNumber()
  costPerUnit?: number;
}
