import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class ReferralJwtAuthGuard extends AuthGuard("referral-jwt") {}
