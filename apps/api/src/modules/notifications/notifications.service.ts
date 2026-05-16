import { Injectable } from "@nestjs/common";
import { RealtimeGateway } from "../../common/realtime.gateway";

@Injectable()
export class NotificationsService {
  constructor(private readonly realtime: RealtimeGateway) {}

  notify(type: string, payload: unknown) {
    this.realtime.emit("notifications.created", { type, payload, createdAt: new Date().toISOString() });
  }
}
