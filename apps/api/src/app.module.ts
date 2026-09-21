import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./modules/auth/auth.module";
import { MessengerModule } from "./modules/messenger/messenger.module";
import { AiModule } from "./modules/ai/ai.module";
import { AiInstructionsModule } from "./modules/ai-instructions/ai-instructions.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { BatchesModule } from "./modules/batches/batches.module";
import { KitchenModule } from "./modules/kitchen/kitchen.module";
import { DeliveriesModule } from "./modules/deliveries/deliveries.module";
import { DeliveryNetworkModule } from "./modules/delivery-network/delivery-network.module";
import { RiderModule } from "./modules/rider/rider.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { ReferralsModule } from "./modules/referrals/referrals.module";
import { ReferralChatModule } from "./modules/referral-chat/referral-chat.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ChatModule } from "./modules/chat/chat.module";
import { HealthModule } from "./modules/health/health.module";
import { McpModule } from "./modules/mcp/mcp.module";
import { DatabaseModule } from "./database/database.module";
import { RealtimeModule } from "./common/realtime.module";
import { GoogleMapsModule } from "./modules/google-maps/google-maps.module";
import { AdminUsersModule } from "./modules/admin-users/admin-users.module";
import { ProductsModule } from "./modules/products/products.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { TranscriptionModule } from "./modules/transcription/transcription.module";
import { CacheModule } from "./common/cache/cache.module";
import { FraudModule } from "./modules/fraud/fraud.module";
import { GoogleWorkspaceModule } from "./modules/google-workspace/google-workspace.module";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CacheModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    AdminUsersModule,
    ProductsModule,
    DocumentsModule,
    MessengerModule,
    AiModule,
    AiInstructionsModule,
    CustomersModule,
    OrdersModule,
    BatchesModule,
    KitchenModule,
    DeliveriesModule,
    DeliveryNetworkModule,
    RiderModule,
    AnalyticsModule,
    InventoryModule,
    ExpensesModule,
    ReferralsModule,
    ReferralChatModule,
    NotificationsModule,
    ChatModule,
    McpModule,
    GoogleMapsModule,
    TranscriptionModule,
    FraudModule,
    GoogleWorkspaceModule,
    RateLimitModule
  ]
})
export class AppModule {}
