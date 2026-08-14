import { Module } from "@nestjs/common";
import { ReferralChatController } from "./referral-chat.controller";
import { ReferralChatService } from "./referral-chat.service";

@Module({
  controllers: [ReferralChatController],
  providers: [ReferralChatService],
  exports: [ReferralChatService]
})
export class ReferralChatModule {}
