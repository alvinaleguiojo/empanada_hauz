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
import { AiPublicAgentController } from "./ai-public-agent.controller";
import { AiPublicAgentService } from "./ai-public-agent.service";
import { AiDateTimeService } from "./ai-datetime.service";

@Module({
  imports: [DatabaseModule, DeliveryNetworkModule, McpModule, AiInstructionsModule, ProductsModule],
  controllers: [AiActionsController, AiPublicAgentController],
  providers: [
    AiApplicationToolsService,
    AiConversationStateService,
    AiRuntimeService,
    AiToolRegistryService,
    AiControlService,
    AiActionConfigService,
    AiPublicAgentService,
    AiDateTimeService
  ],
  exports: [AiControlService, AiRuntimeService, AiToolRegistryService, AiActionConfigService, AiPublicAgentService, AiDateTimeService]
})
export class AiModule {}
