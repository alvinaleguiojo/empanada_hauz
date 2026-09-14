import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { FRAUD_CASE_STATUSES, FRAUD_ENTITY_TYPES, FRAUD_SEVERITIES, type FraudCaseStatus, type FraudEntityType, type FraudSeverity } from "./fraud.service";

export class CreateFraudCaseDto {
  @IsIn(FRAUD_ENTITY_TYPES)
  entityType!: FraudEntityType;

  @IsIn(FRAUD_SEVERITIES)
  severity!: FraudSeverity;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  plateNumber?: string;

  @IsOptional()
  @IsString()
  messengerPsid?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFraudCaseDto {
  @IsOptional()
  @IsIn(FRAUD_CASE_STATUSES)
  status?: FraudCaseStatus;

  @IsOptional()
  @IsIn(FRAUD_SEVERITIES)
  severity?: FraudSeverity;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
