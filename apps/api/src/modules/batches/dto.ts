import { IsDateString, IsIn, IsInt, Min } from "class-validator";

export const BATCH_NAMES = ["morning", "afternoon"] as const;
export type BatchName = (typeof BATCH_NAMES)[number];

export class CreateBatchDto {
  @IsIn(BATCH_NAMES)
  name!: BatchName;

  @IsInt()
  @Min(1)
  maxCapacity!: number;

  @IsDateString()
  cutoffTime!: string;

  @IsDateString()
  estimatedCompletionTime!: string;
}
