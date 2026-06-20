import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AnalyticsService } from "./analytics.service";

@UseGuards(JwtAuthGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  getOverview(@Query("range") range?: string, @Query("startDate") startDate?: string, @Query("endDate") endDate?: string) {
    return this.analyticsService.getOverview(range, startDate, endDate);
  }

  @Get("cash-flow")
  getCashFlow(@Query("range") range?: string, @Query("startDate") startDate?: string, @Query("endDate") endDate?: string) {
    return this.analyticsService.getCashFlow(range, startDate, endDate);
  }
}
