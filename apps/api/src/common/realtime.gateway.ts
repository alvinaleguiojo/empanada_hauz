import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: "*"
  },
  namespace: "/ops"
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly voiceClients = new Map<string, string>();

  handleConnection() {
    return;
  }

  handleDisconnect(client: Socket) {
    for (const [clientId, socketId] of this.voiceClients) {
      if (socketId === client.id) {
        this.voiceClients.delete(clientId);
        client.broadcast.emit("voice.client.left", { clientId });
      }
    }

    return;
  }

  emit(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }

  @SubscribeMessage("voice.presence")
  handleVoicePresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { clientId?: string; name?: string }
  ) {
    if (!payload?.clientId) {
      return;
    }

    this.voiceClients.set(payload.clientId, client.id);
    client.broadcast.emit("voice.client.joined", {
      clientId: payload.clientId,
      name: payload.name ?? "Operator"
    });
  }

  @SubscribeMessage("voice.call.start")
  handleVoiceCallStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VoiceCallStartPayload
  ) {
    client.broadcast.emit("voice.call.incoming", payload);
  }

  @SubscribeMessage("voice.call.accept")
  handleVoiceCallAccept(@MessageBody() payload: VoiceTargetPayload) {
    this.emitToVoiceClient(payload.to, "voice.call.accepted", payload);
  }

  @SubscribeMessage("voice.call.decline")
  handleVoiceCallDecline(@MessageBody() payload: VoiceTargetPayload) {
    this.emitToVoiceClient(payload.to, "voice.call.declined", payload);
  }

  @SubscribeMessage("voice.call.end")
  handleVoiceCallEnd(@MessageBody() payload: VoiceTargetPayload) {
    this.emitToVoiceClient(payload.to, "voice.call.ended", payload);
  }

  @SubscribeMessage("voice.call.offer")
  handleVoiceCallOffer(@MessageBody() payload: VoiceSessionDescriptionPayload) {
    this.emitToVoiceClient(payload.to, "voice.call.offer", payload);
  }

  @SubscribeMessage("voice.call.answer")
  handleVoiceCallAnswer(@MessageBody() payload: VoiceSessionDescriptionPayload) {
    this.emitToVoiceClient(payload.to, "voice.call.answer", payload);
  }

  @SubscribeMessage("voice.call.ice")
  handleVoiceCallIce(@MessageBody() payload: VoiceIceCandidatePayload) {
    this.emitToVoiceClient(payload.to, "voice.call.ice", payload);
  }

  @SubscribeMessage("operator.chat.send")
  handleOperatorChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: OperatorChatMessagePayload
  ) {
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return;
    }

    client.broadcast.emit("operator.chat.message", {
      id: payload.id ?? `${Date.now()}-${client.id}`,
      from: payload.from,
      name: payload.name ?? "Operator",
      text: text.slice(0, 1000),
      createdAt: payload.createdAt ?? new Date().toISOString()
    });
  }

  private emitToVoiceClient(clientId: string | undefined, event: string, payload: unknown) {
    if (!clientId) {
      return;
    }

    const socketId = this.voiceClients.get(clientId);
    if (socketId) {
      this.server.to(socketId).emit(event, payload);
    }
  }
}

type VoiceCallStartPayload = {
  callId?: string;
  from?: string;
  name?: string;
  callType?: "audio" | "video";
  createdAt?: string;
};

type VoiceTargetPayload = {
  callId?: string;
  from?: string;
  to?: string;
};

type VoiceSessionDescriptionPayload = VoiceTargetPayload & {
  description?: unknown;
};

type VoiceIceCandidatePayload = VoiceTargetPayload & {
  candidate?: unknown;
};

type OperatorChatMessagePayload = {
  id?: string;
  from?: string;
  name?: string;
  text?: string;
  createdAt?: string;
};
