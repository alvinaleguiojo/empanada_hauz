import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { OrdersModule } from "../orders/orders.module";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { ProductsModule } from "../products/products.module";
import { MessengerModule } from "../messenger/messenger.module";
import { McpController } from "./mcp.controller";
import { MessengerMcpController } from "./messenger-mcp.controller";
import { McpExpensesService } from "./mcp-expenses.service";
import { McpOrdersService } from "./mcp-orders.service";

@Module({
  imports: [DatabaseModule, OrdersModule, ExpensesModule, DeliveryNetworkModule, ProductsModule, MessengerModule],
  controllers: [McpController, MessengerMcpController],
  providers: [McpOrdersService, McpExpensesService],
  exports: [McpOrdersService]
})
export class McpModule {}
