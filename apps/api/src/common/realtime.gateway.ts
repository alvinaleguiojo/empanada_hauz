import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: "*"
  },
  namespace: "/ops"
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection() {
    return;
  }

  handleDisconnect() {
    return;
  }

  emit(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }
}
