import { Module } from "@nestjs/common";
import { MessengerModule } from "./messenger.module";
import { MessengerSyncService } from "./messenger-sync.service";

@Module({ imports: [MessengerModule], providers: [MessengerSyncService] })
export class MessengerBackgroundModule {}
