import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { PrismaService } from "../../database/prisma.service";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const COLLECTION = "GoogleWorkspaceConnection";
const CONNECTION_ID = "default";
const TIME_ZONE = "Asia/Manila";

type StoredConnection = {
  _id: string;
  googleEmail?: string;
  refreshToken?: string;
  state?: string;
  stateExpiresAt?: Date;
  calendarId?: string;
  driveFolderId?: string;
  connectedAt?: Date;
};

type Order = {
  id: string;
  orderNumber: string;
  quantity: number;
  totalAmount: number;
  deliveryMethod: string;
  paymentMethod: string;
  address?: string | null;
  location?: string | null;
  preferredSchedule?: Date | null;
  status: string;
  notes?: string | null;
  customer?: { name?: string | null; phoneNumber?: string | null } | null;
};

@Injectable()
export class GoogleWorkspaceService {
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  getOAuthUrl() {
    const clientId = this.config.get<string>("GOOGLE_OAUTH_CLIENT_ID");
    const redirectUri = this.getRedirectUri();
    if (!clientId || !redirectUri) throw new BadRequestException("Google OAuth is not configured");

    const state = randomBytes(24).toString("hex");
    void this.saveConnection({ _id: CONNECTION_ID, state, stateExpiresAt: new Date(Date.now() + 10 * 60 * 1000) });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: `${CALENDAR_SCOPE} ${DRIVE_SCOPE}`,
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleOAuthCallback(code: string, state: string) {
    const connection = await this.getConnection();
    if (!connection?.state || connection.state !== state || !connection.stateExpiresAt || new Date(connection.stateExpiresAt).getTime() < Date.now()) {
      throw new BadRequestException("Invalid or expired Google OAuth state");
    }

    const clientId = this.config.get<string>("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = this.config.get<string>("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new BadRequestException("Google OAuth is not configured");

    const tokenResponse = await this.googleFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: this.getRedirectUri(), grant_type: "authorization_code" })
    });
    if (!tokenResponse.ok) throw new BadRequestException(`Google OAuth token exchange failed: ${await tokenResponse.text()}`);

    const token = (await tokenResponse.json()) as { refresh_token?: string; access_token: string; expires_in: number };
    if (!token.refresh_token) throw new BadRequestException("Google did not return a refresh token. Reconnect and approve offline access.");

    const previous = await this.getConnection();
    await this.saveConnection({
      _id: CONNECTION_ID,
      refreshToken: this.encrypt(token.refresh_token),
      connectedAt: new Date(),
      state: undefined,
      stateExpiresAt: undefined
    });
    this.accessToken = { value: token.access_token, expiresAt: Math.floor(Date.now() / 1000) + token.expires_in };

    const profileResponse = await this.googleFetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
    const profile = profileResponse.ok ? (await profileResponse.json()) as { email?: string } : {};
    await this.saveConnection({ _id: CONNECTION_ID, googleEmail: profile.email, refreshToken: this.encrypt(token.refresh_token), connectedAt: new Date() });

    return { connected: true, email: profile.email ?? null, hadPreviousConnection: Boolean(previous?.refreshToken) };
  }

  async status() {
    const connection = await this.getConnection();
    return { connected: Boolean(connection?.refreshToken), email: connection?.googleEmail ?? null, calendarId: connection?.calendarId ?? this.config.get<string>("GOOGLE_CALENDAR_ID", "primary"), driveFolderId: connection?.driveFolderId ?? this.config.get<string>("GOOGLE_DRIVE_EXPORT_FOLDER_ID") ?? null };
  }

  async disconnect() {
    await this.prisma.$runCommandRaw({ delete: COLLECTION, deletes: [{ q: { _id: CONNECTION_ID }, limit: 1 }] });
    this.accessToken = undefined;
    return { disconnected: true };
  }

  async syncOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) throw new BadRequestException("Order not found");
    if (!order.preferredSchedule) return { synced: false, reason: "Order has no preferred schedule" };
    if (["cancelled", "completed"].includes(order.status)) return { synced: false, reason: `Order is ${order.status}` };

    const calendarId = this.config.get<string>("GOOGLE_CALENDAR_ID", "primary");
    const token = await this.getAccessToken();
    const event = await this.findOrderEvent(calendarId, order.id, token);
    const start = new Date(order.preferredSchedule);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const payload = {
      summary: `[${order.orderNumber}] ${order.customer?.name ?? "Customer"} — ${order.quantity} pcs`,
      description: this.buildDescription(order),
      location: order.address ?? order.location ?? undefined,
      start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
      end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
      extendedProperties: { private: { empanadaOrderId: order.id, empanadaOrderNumber: order.orderNumber } },
      reminders: { useDefault: true }
    };

    const url = event?.id
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const response = await this.googleFetch(url, {
      method: event?.id ? "PATCH" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new BadRequestException(`Google Calendar sync failed: ${await response.text()}`);
    const result = await response.json() as { id: string; htmlLink?: string };
    return { synced: true, eventId: result.id, htmlLink: result.htmlLink ?? null, action: event?.id ? "updated" : "created" };
  }

  async deleteOrderEvent(orderId: string) {
    const token = await this.getAccessToken();
    const calendarId = this.config.get<string>("GOOGLE_CALENDAR_ID", "primary");
    const event = await this.findOrderEvent(calendarId, orderId, token);
    if (!event?.id) return { deleted: false, reason: "Event not found" };
    const response = await this.googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    if (!response.ok && response.status !== 404) throw new BadRequestException(`Google Calendar delete failed: ${await response.text()}`);
    return { deleted: true, eventId: event.id };
  }

  private async findOrderEvent(calendarId: string, orderId: string, token: string) {
    const params = new URLSearchParams({ privateExtendedProperty: `empanadaOrderId=${orderId}`, maxResults: "10", showDeleted: "false" });
    const response = await this.googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new BadRequestException(`Google Calendar lookup failed: ${await response.text()}`);
    const body = await response.json() as { items?: Array<{ id: string; htmlLink?: string }> };
    return body.items?.[0];
  }

  private async getAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt - 60 > Math.floor(Date.now() / 1000)) return this.accessToken.value;

    const connection = await this.getConnection();
    const refreshToken = connection?.refreshToken ? this.decrypt(connection.refreshToken) : this.config.get<string>("GOOGLE_OAUTH_REFRESH_TOKEN");
    if (!refreshToken) throw new BadRequestException("Google is not connected. Connect Google Workspace first.");

    const clientId = this.config.get<string>("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = this.config.get<string>("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new BadRequestException("Google OAuth is not configured");
    const response = await this.googleFetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
    if (!response.ok) throw new BadRequestException(`Google OAuth refresh failed: ${await response.text()}`);
    const body = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = { value: body.access_token, expiresAt: Math.floor(Date.now() / 1000) + body.expires_in };
    return body.access_token;
  }

  private buildDescription(order: Order) {
    return [
      `Customer: ${order.customer?.name ?? ""}`,
      `Phone: ${order.customer?.phoneNumber ?? ""}`,
      `Order: ${order.orderNumber}`,
      `Quantity: ${order.quantity} pcs`,
      `Delivery: ${order.deliveryMethod}`,
      `Payment: ${order.paymentMethod}`,
      `Total: ₱${Number(order.totalAmount).toFixed(2)}`,
      `Status: ${order.status}`,
      order.address ? `Address: ${order.address}` : order.location ? `Location: ${order.location}` : "",
      order.notes ? `Notes: ${order.notes}` : ""
    ].filter(Boolean).join("\n");
  }

  private getRedirectUri() {
    return this.config.get<string>("GOOGLE_OAUTH_REDIRECT_URI") ?? `${this.config.get<string>("API_PUBLIC_URL", "http://localhost:4000")}/api/google-workspace/oauth/callback`;
  }

  private async getConnection(): Promise<StoredConnection | null> {
    const result = await this.prisma.$runCommandRaw({ find: COLLECTION, filter: { _id: CONNECTION_ID }, limit: 1 }) as { cursor?: { firstBatch?: StoredConnection[] } };
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  private async saveConnection(data: Partial<StoredConnection> & { _id: string }) {
    const set = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    await this.prisma.$runCommandRaw({ update: COLLECTION, updates: [{ q: { _id: CONNECTION_ID }, u: { $set: set }, upsert: true, multi: false }] });
  }

  private encrypt(value: string) {
    const key = Buffer.from(this.config.getOrThrow<string>("GOOGLE_TOKEN_ENCRYPTION_KEY"), "base64");
    if (key.length !== 32) throw new BadRequestException("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  private decrypt(value: string) {
    const key = Buffer.from(this.config.getOrThrow<string>("GOOGLE_TOKEN_ENCRYPTION_KEY"), "base64");
    if (key.length !== 32) throw new BadRequestException("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
  }

  private async googleFetch(url: string, options: RequestInit) {
    try { return await fetch(url, options); } catch (error) { throw new BadRequestException(`Unable to connect to Google APIs: ${error instanceof Error ? error.message : String(error)}`); }
  }
}
