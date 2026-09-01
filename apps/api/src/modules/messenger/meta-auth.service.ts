import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

interface MetaTokenDebug { data?: { type?: string; profile_id?: string; is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[] } }
interface MetaPageAccount { id: string; name?: string; access_token?: string }

@Injectable()
export class MetaAuthService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}
  private graphVersion() { return this.config.get<string>("META_GRAPH_API_VERSION") ?? "v26.0"; }
  private pageId() { return this.config.get<string>("META_PAGE_ID") ?? ""; }
  private appId() { return this.config.get<string>("META_APP_ID") ?? ""; }
  private appSecret() { return this.config.get<string>("META_APP_SECRET") ?? ""; }
  private redirectUri() { return this.config.get<string>("META_OAUTH_REDIRECT_URI") ?? "http://localhost:3000/messenger/auth/callback"; }
  private encryptionKey() {
    const value = this.config.get<string>("META_TOKEN_ENCRYPTION_KEY");
    if (!value) throw new Error("META_TOKEN_ENCRYPTION_KEY is not configured");
    const key = Buffer.from(value, "hex");
    if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must be a 32-byte hex value");
    return key;
  }
  private encrypt(value: string) {
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
  }
  private decrypt(value: string) {
    const [ivHex, tagHex, encryptedHex] = value.split(":");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
  }
  private async graphGet<T>(path: string, token?: string) {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}${path}`);
    if (token) url.searchParams.set("access_token", token);
    const response = await fetch(url, { headers: { accept: "application/json" } }); const body = await response.text();
    if (!response.ok) throw new BadRequestException(`Meta Graph API failed: ${response.status} ${body}`);
    return JSON.parse(body) as T;
  }
  private async graphPost<T>(path: string, token: string, params: Record<string, string>) {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}${path}`);
    url.searchParams.set("access_token", token);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, { method: "POST", headers: { accept: "application/json" } });
    const body = await response.text();
    if (!response.ok) throw new BadRequestException(`Meta Graph API POST failed: ${response.status} ${body}`);
    return JSON.parse(body) as T;
  }
  private async exchangeCode(code: string) {
    if (!this.appId() || !this.appSecret()) throw new Error("META_APP_ID and META_APP_SECRET are required");
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/oauth/access_token`);
    url.searchParams.set("client_id", this.appId()); url.searchParams.set("client_secret", this.appSecret()); url.searchParams.set("redirect_uri", this.redirectUri()); url.searchParams.set("code", code);
    const response = await fetch(url, { headers: { accept: "application/json" } }); const body = await response.text();
    if (!response.ok) throw new BadRequestException(`Meta OAuth code exchange failed: ${response.status} ${body}`);
    return JSON.parse(body) as { access_token: string };
  }
  async beginOAuth() {
    if (!this.appId()) throw new Error("META_APP_ID is not configured");
    const state = randomBytes(32).toString("hex"); const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.metaConnection.upsert({ where: { id: "meta" }, create: { id: "meta", oauthState: state, oauthStateExpiresAt: expiresAt }, update: { oauthState: state, oauthStateExpiresAt: expiresAt } });
    const url = new URL(`https://www.facebook.com/${this.graphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", this.appId()); url.searchParams.set("redirect_uri", this.redirectUri()); url.searchParams.set("state", state); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", "pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata");
    return url.toString();
  }
  async handleOAuthCallback(code: string, state: string) {
    const connection = await this.prisma.metaConnection.findUnique({ where: { id: "meta" } });
    if (!connection?.oauthState || connection.oauthState !== state || !connection.oauthStateExpiresAt || connection.oauthStateExpiresAt < new Date()) throw new UnauthorizedException("Invalid or expired Meta OAuth state");
    const userToken = await this.exchangeCode(code);
    const accounts = await this.graphGet<{ data?: MetaPageAccount[] }>("/me/accounts?fields=id,name,access_token", userToken.access_token);
    const page = (accounts.data ?? []).find((item) => item.id === this.pageId());
    if (!page?.access_token) throw new BadRequestException(`Meta OAuth succeeded, but Page ${this.pageId()} was not authorized`);
    const debug = await this.graphGet<MetaTokenDebug>(`/debug_token?input_token=${encodeURIComponent(page.access_token)}`, page.access_token);
    const data = debug.data;
    if (!data?.is_valid || data.type !== "PAGE" || data.profile_id !== this.pageId()) throw new BadRequestException("Meta returned an invalid Page Access Token for the configured Page");
    await this.prisma.metaConnection.upsert({
      where: { id: "meta" },
      create: { id: "meta", pageId: page.id, pageName: page.name, encryptedAccessToken: this.encrypt(page.access_token), expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined, dataAccessExpiresAt: data.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : undefined, connectedAt: new Date() },
      update: { pageId: page.id, pageName: page.name, encryptedAccessToken: this.encrypt(page.access_token), expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null, dataAccessExpiresAt: data.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : null, connectedAt: new Date(), oauthState: null, oauthStateExpiresAt: null }
    });
    await this.subscribePageToMessenger(page.id, page.access_token);
    return { pageId: page.id, pageName: page.name, expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null };
  }
  private async subscribePageToMessenger(pageId: string, pageAccessToken: string) {
    await this.graphPost<{ success?: boolean }>(`/${encodeURIComponent(pageId)}/subscribed_apps`, pageAccessToken, {
      subscribed_fields: "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_handovers"
    });
  }
  async getPageToken() {
    const connection = await this.prisma.metaConnection.findUnique({ where: { id: "meta" } });
    return connection?.encryptedAccessToken ? this.decrypt(connection.encryptedAccessToken) : this.config.get<string>("META_PAGE_ACCESS_TOKEN") ?? "";
  }
  async status() {
    const token = await this.getPageToken(); if (!token) return { authenticated: false, status: "missing" };
    try {
      const debug = await this.graphGet<MetaTokenDebug>(`/debug_token?input_token=${encodeURIComponent(token)}`, token); const data = debug.data;
      const authenticated = Boolean(data?.is_valid && data.type === "PAGE" && data.profile_id === this.pageId());
      return { authenticated, status: authenticated ? "authenticated" : "invalid", pageId: this.pageId(), tokenType: data?.type ?? null, expiresAt: data?.expires_at ? new Date(data.expires_at * 1000) : null, dataAccessExpiresAt: data?.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : null, scopes: data?.scopes ?? [] };
    } catch { return { authenticated: false, status: "invalid" }; }
  }
  async ensureAuthenticated() {
    const status = await this.status();
    if (!status.authenticated) throw new UnauthorizedException("Meta Page authentication is missing or expired. Reconnect Meta and try again.");
    return status;
  }
}
