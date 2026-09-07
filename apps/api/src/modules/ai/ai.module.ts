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
import { AiActionConfigService } from "./ai-action-config.service";
import { AiActionsController } from "./ai-actions.controller";

@Module({
  imports: [DatabaseModule, DeliveryNetworkModule, McpModule, AiInstructionsModule, ProductsModule],
  controllers: [AiActionsController],
  providers: [
    AiApplicationToolsService,
    AiConversationStateService,
    AiRuntimeService,
    AiToolRegistryService,
    AiControlService,
    AiActionConfigService
  ],
  exports: [AiControlService, AiRuntimeService, AiToolRegistryService, AiActionConfigService]
})
export class AiModule {}
