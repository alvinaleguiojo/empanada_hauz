import { Module } from "@nestjs/common";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { DatabaseModule } from "../../database/database.module";
import { McpModule } from "../mcp/mcp.module";
import { AiInstructionsModule } from "../ai-instructions/ai-instructions.module";
import { ProductsModule } from "../products/products.module";
import { AiApplicationToolsService } from "./ai-application-tools.service";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiRuntimeService } from "./ai-runtime.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { AiControlService } from "./ai-control.service";

@Module({
  imports: [DatabaseModule, DeliveryNetworkModule, McpModule, AiInstructionsModule, ProductsModule],
  providers: [
    AiApplicationToolsService,
    AiConversationStateService,
    AiRuntimeService,
    AiToolRegistryService,
    AiControlService
  ],
  exports: [AiControlService, AiRuntimeService, AiToolRegistryService]
})
export class AiModule {}
