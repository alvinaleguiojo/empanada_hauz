import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "./modules/auth/auth.module";
import { MessengerModule } from "./modules/messenger/messenger.module";
import { AiModule } from "./modules/ai/ai.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { BatchesModule } from "./modules/batches/batches.module";
import { KitchenModule } from "./modules/kitchen/kitchen.module";
import { DeliveriesModule } from "./modules/deliveries/deliveries.module";
import { DeliveryNetworkModule } from "./modules/delivery-network/delivery-network.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { HealthModule } from "./modules/health/health.module";
import { DatabaseModule } from "./database/database.module";
import { RealtimeModule } from "./common/realtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>("REDIS_URL")
        }
      })
    }),
    DatabaseModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    MessengerModule,
    AiModule,
    CustomersModule,
    OrdersModule,
    BatchesModule,
    KitchenModule,
    DeliveriesModule,
    DeliveryNetworkModule,
    AnalyticsModule,
    InventoryModule,
    NotificationsModule
  ]
})
export class AppModule {}
