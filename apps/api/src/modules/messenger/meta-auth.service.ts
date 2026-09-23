import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

interface MetaTokenDebug { data?: { type?: string; profile_id?: string; is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[] } }
interface MetaPageAccount { id: string; name?: string; access_token?: string }
interface MetaSubscribedApp { id?: string; name?: string; subscribed_fields?: string[] }
interface MetaWebhookField {
  name?: string;
  version?: string;
}

interface MetaWebhookSubscription {
  object?: string;
  callback_url?: string;
  active?: boolean;
  fields?: Array<string | MetaWebhookField>;
}

@Injectable()
export class MetaAuthService implements OnModuleInit {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}
  private graphVersion() { return this.config.get<string>("META_GRAPH_API_VERSION") ?? "v26.0"; }
  private pageId() { return this.config.get<string>("META_PAGE_ID") ?? ""; }
  getConfiguredPageId() { return this.pageId(); }
  private appId() { return this.config.get<string>("META_APP_ID") ?? ""; }
  private appSecret() { return this.config.get<string>("META_APP_SECRET") ?? ""; }
  private appAccessToken() {
    const appId = this.appId();
    const appSecret = this.appSecret();
    return appId && appSecret ? `${appId}|${appSecret}` : "";
  }
  private webhookCallbackUrl() {
    const configured = this.config.get<string>("META_WEBHOOK_CALLBACK_URL")?.trim().replace(/\/+$/, "");
    if (configured) return configured;
    const appUrl = this.config.get<string>("APP_URL")?.trim().replace(/\/+$/, "");
    if (appUrl) return `${appUrl}/api/messenger/webhook`;
    return "https://api.empanadahauz.com/api/messenger/webhook";
  }
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
    const response = await this.graphFetch(url, { headers: { accept: "application/json" } }); const body = await response.text();
    if (!response.ok) throw new BadRequestException(`Meta Graph API failed: ${response.status} ${body}`);
    return JSON.parse(body) as T;
  }
  private async graphPost<T>(path: string, token: string, params: Record<string, string>) {
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}${path}`);
    url.searchParams.set("access_token", token);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.graphFetch(url, { method: "POST", headers: { accept: "application/json" } });
    const body = await response.text();
    if (!response.ok) throw new BadRequestException(`Meta Graph API POST failed: ${response.status} ${body}`);
    return JSON.parse(body) as T;
  }
  private async exchangeCode(code: string) {
    if (!this.appId() || !this.appSecret()) throw new Error("META_APP_ID and META_APP_SECRET are required");
    const url = new URL(`https://graph.facebook.com/${this.graphVersion()}/oauth/access_token`);
    url.searchParams.set("client_id", this.appId()); url.searchParams.set("client_secret", this.appSecret()); url.searchParams.set("redirect_uri", this.redirectUri()); url.searchParams.set("code", code);
    const response = await this.graphFetch(url, { headers: { accept: "application/json" } }); const body = await response.text();
    if (!response.ok) throw new BadRequestException(`Meta OAuth code exchange failed: ${response.status} ${body}`);
    return JSON.parse(body) as { access_token: string };
  }

  private async graphFetch(url: URL, options: RequestInit) {
    try {
      return await fetch(url, options);
    } catch {
      throw new ServiceUnavailableException("Meta Graph API is unavailable. Check the internet connection and try again.");
    }
  }

  async onModuleInit() {
    setTimeout(() => { void this.reconcileWebhookSubscriptions("startup"); }, 2000);
  }

  private async reconcileWebhookSubscriptions(source: string) {
    await this.reconcileAppWebhookSubscription(source);
    await this.reconcilePageSubscription(source);
  }

  private async reconcileAppWebhookSubscription(source: string) {
    const appId = this.appId();
    const appAccessToken = this.appAccessToken();
    const callbackUrl = this.webhookCallbackUrl();
    const verifyToken = this.config.get<string>("META_VERIFY_TOKEN")?.trim();
    if (!appId || !appAccessToken || !verifyToken) {
      console.warn(
        `[Messenger] App webhook subscription reconciliation skipped (${source}): appId=${Boolean(appId)} appSecret=${Boolean(this.appSecret())} verifyToken=${Boolean(verifyToken)} callbackUrl=${Boolean(callbackUrl)}`
      );
      return;
    }

    try {
      const currentResult = await this.graphGet<{ data?: MetaWebhookSubscription[] }>(
        `/${encodeURIComponent(appId)}/subscriptions`,
        appAccessToken
      );
      const current = (currentResult.data ?? []).find((item) => item.object === "page");
      let hasMessages = current?.fields?.some((field) =>
        typeof field === "string" ? field === "messages" : field?.name === "messages"
      ) ?? false;
      let matchesCallback = current?.callback_url === callbackUrl;
      let active = current?.active !== false;

      if (!hasMessages || !matchesCallback || !active) {
        await this.graphPost(
          `/${encodeURIComponent(appId)}/subscriptions`,
          appAccessToken,
          {
            object: "page",
            callback_url: callbackUrl,
            verify_token: verifyToken,
            fields: "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_handovers"
          }
        );
        // Meta may return subscription fields as objects ({ name, version })
        // rather than bare strings. The successful POST above is the source of
        // truth for the repaired state; avoid immediately treating the object
        // shape as an unsubscribed state and posting on every status check.
        hasMessages = true;
        matchesCallback = true;
        active = true;
      }

      console.log(
        `[Messenger] App webhook subscription reconciled (${source}): object=page active=${active} messages=${hasMessages} callback=${matchesCallback} callbackUrl=${callbackUrl}`
      );
    } catch (err) {
      console.warn(
        `[Messenger] App webhook subscription reconciliation failed (${source}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async reconcilePageSubscription(source: string) {
    const pageId = this.pageId();
    if (!pageId || !this.appId()) return;
    try {
      const token = await this.getPageToken();
      if (!token) return;
      const debug = await this.graphGet<MetaTokenDebug>(`/debug_token?input_token=${encodeURIComponent(token)}`, token);
      const data = debug.data;
      if (!data?.is_valid || data.type !== "PAGE" || data.profile_id !== pageId) return;
      const result = await this.graphGet<{ data?: MetaSubscribedApp[] }>(`/${encodeURIComponent(pageId)}/subscribed_apps?fields=id,name,subscribed_fields`, token);
      const current = (result.data ?? []).find((item) => item.id === this.appId());
      const hasMessages = current?.subscribed_fields?.includes("messages") ?? false;
      if (!current || !hasMessages) await this.subscribePageToMessenger(pageId, token);
      console.log(`[Messenger] Page webhook subscription reconciled (${source}): page=${pageId} app=${this.appId()} subscribed=${Boolean(current)} messages=${hasMessages}`);
    } catch (err) {
      console.warn(`[Messenger] Page webhook subscription reconciliation failed (${source}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private createOAuthState() {
    if (!this.appSecret()) throw new Error("META_APP_SECRET is not configured");
    const issuedAt = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(32).toString("hex");
    const payload = `${issuedAt}.${nonce}`;
    const signature = createHmac("sha256", this.appSecret()).update(payload).digest("hex");
    return `${Buffer.from(payload).toString("base64url")}.${signature}`;
  }

  private verifyOAuthState(state: string) {
    if (!this.appSecret() || !state) return false;
    const [encodedPayload, signature] = state.split(".");
    if (!encodedPayload || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    let payload: string;
    try { payload = Buffer.from(encodedPayload, "base64url").toString("utf8"); } catch { return false; }
    const [issuedAt, nonce] = payload.split(".");
    if (!/^\d+$/.test(issuedAt) || !/^[a-f0-9]{64}$/i.test(nonce)) return false;
    const age = Math.floor(Date.now() / 1000) - Number(issuedAt);
    if (age < 0 || age > 10 * 60) return false;
    const expected = createHmac("sha256", this.appSecret()).update(payload).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex"); const receivedBuffer = Buffer.from(signature, "hex");
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  async beginOAuth() {
    if (!this.appId()) throw new Error("META_APP_ID is not configured");
    const state = this.createOAuthState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.metaConnection.upsert({ where: { id: "meta" }, create: { id: "meta", oauthState: state, oauthStateExpiresAt: expiresAt }, update: { oauthState: state, oauthStateExpiresAt: expiresAt } });
    const url = new URL(`https://www.facebook.com/${this.graphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", this.appId()); url.searchParams.set("redirect_uri", this.redirectUri()); url.searchParams.set("state", state); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", "pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata");
    return url.toString();
  }

  async handleOAuthCallback(code: string, state: string) {
    if (!code || !this.verifyOAuthState(state)) throw new UnauthorizedException("Invalid or expired Meta OAuth state");
    const userToken = await this.exchangeCode(code);
    const accounts = await this.graphGet<{ data?: MetaPageAccount[] }>("/me/accounts?fields=id,name,access_token", userToken.access_token);
    const page = (accounts.data ?? []).find((item) => item.id === this.pageId());
    if (!page?.access_token) throw new BadRequestException(`Meta OAuth succeeded, but Page ${this.pageId()} was not authorized`);
    const debug = await this.graphGet<MetaTokenDebug>(`/debug_token?input_token=${encodeURIComponent(page.access_token)}`, page.access_token);
    const data = debug.data;
    if (!data?.is_valid || data.type !== "PAGE" || data.profile_id !== this.pageId()) throw new BadRequestException("Meta returned an invalid Page Access Token for the configured Page");
    await this.prisma.metaConnection.upsert({
      where: { id: "meta" },
      create: { id: "meta", pageId: page.id, pageName: page.name, encryptedAccessToken: this.encrypt(page.access_token), expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined, dataAccessExpiresAt: data.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : undefined, connectedAt: new Date(), oauthState: null, oauthStateExpiresAt: null },
      update: { pageId: page.id, pageName: page.name, encryptedAccessToken: this.encrypt(page.access_token), expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null, dataAccessExpiresAt: data.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : null, connectedAt: new Date(), oauthState: null, oauthStateExpiresAt: null }
    });
    await this.subscribePageToMessenger(page.id, page.access_token);
    return { pageId: page.id, pageName: page.name, expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null };
  }
  private async subscribePageToMessenger(pageId: string, pageAccessToken: string) {
    await this.graphPost<{ success?: boolean }>(`/${encodeURIComponent(pageId)}/subscribed_apps`, pageAccessToken, { subscribed_fields: "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_handovers" });
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
      if (authenticated) await this.reconcileWebhookSubscriptions("status");
      return { authenticated, status: authenticated ? "authenticated" : "invalid", pageId: this.pageId(), tokenType: data?.type ?? null, expiresAt: data?.expires_at ? new Date(data.expires_at * 1000) : null, dataAccessExpiresAt: data?.data_access_expires_at ? new Date(data.data_access_expires_at * 1000) : null, scopes: data?.scopes ?? [] };
    } catch { return { authenticated: false, status: "invalid" }; }
  }
  async ensureAuthenticated() {
    const status = await this.status();
    if (!status.authenticated) throw new UnauthorizedException("Meta Page authentication is missing or expired. Reconnect Meta and try again.");
    return status;
  }
}
