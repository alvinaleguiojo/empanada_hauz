import { Module } from "@nestjs/common";
import { BatchesModule } from "../batches/batches.module";
import { GoogleDriveOrderExportService } from "./google-drive-order-export.service";
import { GoogleSheetsOrderSyncService } from "./google-sheets-order-sync.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [BatchesModule],
  controllers: [OrdersController],
  providers: [OrdersService, GoogleSheetsOrderSyncService, GoogleDriveOrderExportService],
  exports: [OrdersService]
})
export class OrdersModule {}
