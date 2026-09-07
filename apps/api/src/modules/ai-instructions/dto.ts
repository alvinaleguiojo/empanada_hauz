import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export const AI_INSTRUCTION_KINDS = ["instruction", "prompt"] as const;
export type AiInstructionKind = (typeof AI_INSTRUCTION_KINDS)[number];

export class CreateAiInstructionDto {
  @IsString()
  @MinLength(1)
  @Max(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @Max(3000)
  content!: string;

  @IsOptional()
  @IsIn(AI_INSTRUCTION_KINDS)
  kind?: AiInstructionKind;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;
}

export class UpdateAiInstructionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Max(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Max(3000)
  content?: string;

  @IsOptional()
  @IsIn(AI_INSTRUCTION_KINDS)
  kind?: AiInstructionKind;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;
}
