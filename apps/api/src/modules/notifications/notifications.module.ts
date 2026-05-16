import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { ScheduleRemindersService } from "./schedule-reminders.service";
import { DatabaseModule } from "../../database/database.module";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [NotificationsService, ScheduleRemindersService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
