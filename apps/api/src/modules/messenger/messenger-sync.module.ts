import { Module } from "@nestjs/common";
import { MessengerSyncService } from "./messenger-sync.service";

@Module({ providers: [MessengerSyncService] })
export class MessengerSyncModule {}
