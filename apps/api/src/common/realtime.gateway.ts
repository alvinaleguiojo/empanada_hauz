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
import { ChatService } from "../modules/chat/chat.service";

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/ops"
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly voiceClients = new Map<string, string>();
  private readonly riderClients = new Map<string, Set<string>>();

  constructor(private readonly chatService: ChatService) {}

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

    for (const [riderId, sockets] of this.riderClients) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.riderClients.delete(riderId);
    }
  }

  emit(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }

  emitToRider(riderId: string, event: string, payload: unknown) {
    this.server.to(this.riderRoom(riderId)).emit(event, payload);
  }

  @SubscribeMessage("rider.presence")
  handleRiderPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { riderId?: string }
  ) {
    const riderId = payload?.riderId?.trim();
    if (!riderId) return;

    const room = this.riderRoom(riderId);
    void client.join(room);

    const sockets = this.riderClients.get(riderId) ?? new Set<string>();
    sockets.add(client.id);
    this.riderClients.set(riderId, sockets);
    client.emit("rider.realtime.ready", { riderId });
  }

  @SubscribeMessage("voice.presence")
  handleVoicePresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { clientId?: string; name?: string }
  ) {
    if (!payload?.clientId) return;
    this.voiceClients.set(payload.clientId, client.id);
    client.broadcast.emit("voice.client.joined", {
      clientId: payload.clientId,
      name: payload.name ?? "Operator"
    });
  }

  @SubscribeMessage("voice.call.start")
  handleVoiceCallStart(@ConnectedSocket() client: Socket, @MessageBody() payload: VoiceCallStartPayload) {
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
  async handleOperatorChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: OperatorChatMessagePayload
  ) {
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text || !payload?.from) return;

    const saved = await this.chatService.record({
      fromId: payload.from,
      name: payload.name ?? "Operator",
      text: text.slice(0, 1000),
      createdAt: payload.createdAt
    });

    client.broadcast.emit("operator.chat.message", saved);
  }

  private riderRoom(riderId: string) {
    return `rider:${riderId}`;
  }

  private emitToVoiceClient(clientId: string | undefined, event: string, payload: unknown) {
    if (!clientId) return;
    const socketId = this.voiceClients.get(clientId);
    if (socketId) this.server.to(socketId).emit(event, payload);
  }
}

type VoiceCallStartPayload = {
  callId?: string;
  from?: string;
  name?: string;
  callType?: "audio" | "video";
  createdAt?: string;
};

type VoiceTargetPayload = { callId?: string; from?: string; to?: string };
type VoiceSessionDescriptionPayload = VoiceTargetPayload & { description?: unknown };
type VoiceIceCandidatePayload = VoiceTargetPayload & { candidate?: unknown };
type OperatorChatMessagePayload = { id?: string; from?: string; name?: string; text?: string; createdAt?: string };
