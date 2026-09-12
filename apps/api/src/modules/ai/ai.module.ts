import { Module } from "@nestjs/common";
import { DeliveryNetworkModule } from "../delivery-network/delivery-network.module";
import { DatabaseModule } from "../../database/database.module";
import { CustomersModule } from "../customers/customers.module";
import { McpModule } from "../mcp/mcp.module";
import { AiInstructionsModule } from "../ai-instructions/ai-instructions.module";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { ProductsModule } from "../products/products.module";
import { ProductsService } from "../products/products.service";
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
import { AiModelService } from "./ai-model.service";
import { AiAdminAgentController } from "./ai-admin-agent.controller";
import { AiAdminAgentService } from "./ai-admin-agent.service";
import { AdminAgentFacadeService } from "./admin-agent/admin-agent-facade.service";
import { AdminAgentRouterService } from "./admin-agent/admin-agent-router.service";
import { AdminAgentToolsetService } from "./admin-agent/admin-agent-toolset.service";
import { AiAdminModelService } from "./ai-admin-model.service";
import { AiAdminAnalyticsToolsService } from "./ai-admin-analytics-tools.service";
import { AiAdminActionStateService } from "./ai-admin-action-state.service";

@Module({
  imports: [DatabaseModule, CustomersModule, DeliveryNetworkModule, McpModule, AiInstructionsModule, ProductsModule],
  controllers: [AiActionsController, AiPublicAgentController, AiAdminAgentController],
  providers: [
    AiApplicationToolsService,
    AiConversationStateService,
    {
      provide: AiRuntimeService,
      inject: [AiModelService, AiConversationStateService, AiToolRegistryService, AiInstructionsService, ProductsService],
      useFactory: (aiModel: AiModelService, stateService: AiConversationStateService, toolRegistry: AiToolRegistryService, instructionsService: AiInstructionsService, productsService: ProductsService) => aiModel.createRuntime(stateService, toolRegistry, instructionsService, productsService)
    },
    AiToolRegistryService,
    AiControlService,
    AiActionConfigService,
    AiModelService,
    AiAdminModelService,
    AiAdminAnalyticsToolsService,
    AiAdminActionStateService,
    AdminAgentRouterService,
    AdminAgentToolsetService,
    AiAdminAgentService,
    AdminAgentFacadeService,
    AiPublicAgentService,
    AiDateTimeService
  ],
  exports: [AiControlService, AiRuntimeService, AiToolRegistryService, AiActionConfigService, AiPublicAgentService, AiDateTimeService, AiModelService, AiAdminAgentService, AdminAgentFacadeService]
})
export class AiModule {}
