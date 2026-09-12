import { forwardRef, Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { CustomersModule } from "../customers/customers.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MessengerController } from "./messenger.controller";
import { MessengerService } from "./messenger.service";
import { MetaAuthService } from "./meta-auth.service";
import { MessengerSyncService } from "./messenger-sync.service";

@Module({
  imports: [forwardRef(() => AiModule), CustomersModule, NotificationsModule],
  controllers: [MessengerController],
  providers: [MessengerService, MetaAuthService, MessengerSyncService],
  exports: [MessengerService, MetaAuthService]
})
export class MessengerModule {}
