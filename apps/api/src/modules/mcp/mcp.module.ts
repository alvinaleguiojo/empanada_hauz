import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { OrdersModule } from "../orders/orders.module";
import { McpController } from "./mcp.controller";
import { McpOrdersService } from "./mcp-orders.service";

@Module({
  imports: [DatabaseModule, OrdersModule],
  controllers: [McpController],
  providers: [McpOrdersService]
})
export class McpModule {}
