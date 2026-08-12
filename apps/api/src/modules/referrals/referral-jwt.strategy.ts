import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class ReferralJwtStrategy extends PassportStrategy(Strategy, "referral-jwt") {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET")
    });
  }

  async validate(payload: { sub: string; email: string; type?: string }) {
    if (payload.type !== "referral_partner") {
      throw new UnauthorizedException("Referral partner token required");
    }

    return payload;
  }
}
