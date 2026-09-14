import { forwardRef, Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { OrdersModule } from "../orders/orders.module";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { ProductsModule } from "../products/products.module";
import { MessengerModule } from "../messenger/messenger.module";
import { AuthModule } from "../auth/auth.module";
import { McpController } from "./mcp.controller";
import { MessengerMcpController } from "./messenger-mcp.controller";
import { McpOAuthController } from "./mcp-oauth.controller";
import { McpAuthService } from "./mcp-auth.service";
import { McpExpensesService } from "./mcp-expenses.service";
import { McpOrdersService } from "./mcp-orders.service";

@Module({
  imports: [DatabaseModule, AuthModule, OrdersModule, ExpensesModule, DeliveryNetworkModule, ProductsModule, forwardRef(() => MessengerModule)],
  controllers: [McpController, MessengerMcpController, McpOAuthController],
  providers: [McpOrdersService, McpExpensesService, McpAuthService],
  exports: [McpOrdersService]
})
export class McpModule {}
