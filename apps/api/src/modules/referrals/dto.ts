import { Type } from "class-transformer";
import { IsEmail, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ReferralPartnerSignupDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class ReferralPartnerLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class UpdateReferralCommissionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage!: number;
}

export class ListReferralPartnersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 10;
}
