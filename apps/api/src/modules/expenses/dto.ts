import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class ListExpensesDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateExpenseDto {
  @IsString()
  category!: string;

  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  expenseDate!: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;
}
