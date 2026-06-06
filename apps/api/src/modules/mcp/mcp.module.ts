import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { McpController } from "./mcp.controller";
import { McpOrdersService } from "./mcp-orders.service";

@Module({
  imports: [DatabaseModule],
  controllers: [McpController],
  providers: [McpOrdersService]
})
export class McpModule {}
