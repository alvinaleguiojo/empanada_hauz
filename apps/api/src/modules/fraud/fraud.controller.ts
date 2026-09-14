import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateFraudCaseDto, UpdateFraudCaseDto } from "./dto";
import { FraudService, FRAUD_CASE_STATUSES, FRAUD_ENTITY_TYPES, type FraudCaseStatus, type FraudEntityType } from "./fraud.service";

type JwtRequest = { user?: { sub?: string } };

@UseGuards(JwtAuthGuard)
@Controller("fraud")
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Get("cases")
  listCases(
    @Query("entityType") entityType?: FraudEntityType,
    @Query("status") status?: FraudCaseStatus
  ) {
    return this.fraudService.listCases({
      entityType: FRAUD_ENTITY_TYPES.includes(entityType as FraudEntityType) ? entityType : undefined,
      status: FRAUD_CASE_STATUSES.includes(status as FraudCaseStatus) ? status : undefined
    });
  }

  @Get("logs")
  listLogs(@Query("limit") limit?: string) {
    return this.fraudService.listLogs(Number(limit) || 200);
  }

  @Get("stats")
  stats() {
    return this.fraudService.stats();
  }

  @Post("cases")
  createCase(@Req() request: JwtRequest, @Body() dto: CreateFraudCaseDto) {
    return this.fraudService.createCase({ ...dto, userId: request.user?.sub });
  }

  @Patch("cases/:id")
  updateCase(@Req() request: JwtRequest, @Param("id") id: string, @Body() dto: UpdateFraudCaseDto) {
    return this.fraudService.updateCase(id, { ...dto, userId: request.user?.sub });
  }

  @Delete("cases/:id")
  deleteCase(@Param("id") id: string) {
    return this.fraudService.deleteCase(id);
  }
}
