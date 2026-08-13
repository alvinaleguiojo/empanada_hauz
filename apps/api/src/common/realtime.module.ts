import { Global, Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";
import { ChatModule } from "../modules/chat/chat.module";

@Global()
@Module({
  imports: [ChatModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway]
})
export class RealtimeModule {}
