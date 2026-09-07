import { Module } from "@nestjs/common";
import { BatchesModule } from "../batches/batches.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReferralsModule } from "../referrals/referrals.module";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { ProductsModule } from "../products/products.module";
import { GoogleDriveOrderExportService } from "./google-drive-order-export.service";
import { GoogleSheetsOrderSyncService } from "./google-sheets-order-sync.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [BatchesModule, NotificationsModule, ReferralsModule, DeliveryNetworkModule, ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService, GoogleSheetsOrderSyncService, GoogleDriveOrderExportService],
  exports: [OrdersService]
})
export class OrdersModule {}
