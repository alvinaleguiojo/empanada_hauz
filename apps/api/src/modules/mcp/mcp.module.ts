import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { OrdersModule } from "../orders/orders.module";
import { McpController } from "./mcp.controller";
import { McpExpensesService } from "./mcp-expenses.service";
import { McpOrdersService } from "./mcp-orders.service";

@Module({
  imports: [DatabaseModule, OrdersModule, ExpensesModule],
  controllers: [McpController],
  providers: [McpOrdersService, McpExpensesService]
})
export class McpModule {}
