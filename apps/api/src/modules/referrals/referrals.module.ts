import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ReferralJwtStrategy } from "./referral-jwt.strategy";
import { ReferralsController } from "./referrals.controller";
import { ReferralsService } from "./referrals.service";

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "1d") as never
        }
      })
    })
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralJwtStrategy],
  exports: [ReferralsService]
})
export class ReferralsModule {}
