import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ListReferralPartnersQueryDto, ReferralPartnerLoginDto, ReferralPartnerSignupDto, UpdateReferralCommissionDto } from "./dto";
import { ReferralJwtAuthGuard } from "./referral-jwt-auth.guard";
import { ReferralsService } from "./referrals.service";

type AuthenticatedRequest = Request & {
  user?: {
    sub?: string;
    role?: string;
  };
};

@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post("partners/signup")
  signupPartner(@Body() dto: ReferralPartnerSignupDto) {
    return this.referralsService.signupPartner(dto);
  }

  @Post("partners/login")
  loginPartner(@Body() dto: ReferralPartnerLoginDto) {
    return this.referralsService.loginPartner(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: AuthenticatedRequest) {
    return this.referralsService.getDashboard(req.user?.sub ?? "");
  }

  @UseGuards(ReferralJwtAuthGuard)
  @Get("partners/me")
  partnerMe(@Req() req: AuthenticatedRequest) {
    return this.referralsService.getPartnerDashboard(req.user?.sub ?? "");
  }

  @UseGuards(ReferralJwtAuthGuard)
  @Get("partners/status")
  partnerStatus(@Req() req: AuthenticatedRequest) {
    return this.referralsService.getPartnerStatus(req.user?.sub ?? "");
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners")
  partners(@Query() query: ListReferralPartnersQueryDto, @Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.referralsService.listPartners(query);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("partners/:id/approve")
  approvePartner(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.referralsService.approvePartner({ id, approvedByUserId: req.user?.sub ?? "" });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/commission")
  updateCommission(@Param("id") id: string, @Body() dto: UpdateReferralCommissionDto, @Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.referralsService.updateCommission({ id, commissionPercentage: dto.commissionPercentage });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/paid")
  markPaid(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    this.assertAdmin(req);
    return this.referralsService.markCommissionPaid({ id, paidByUserId: req.user?.sub ?? "" });
  }

  private assertAdmin(req: AuthenticatedRequest) {
    if (req.user?.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
  }
}
