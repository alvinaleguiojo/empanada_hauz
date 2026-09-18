import { Body, Controller, Get, Header, Logger, Post, Query, Req, Res, UnauthorizedException, UseInterceptors } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { AuthService } from "../auth/auth.service";
import { NoCacheInterceptor } from "./no-cache.interceptor";

type ClientRegistration = {
  client_id?: string;
  redirect_uris?: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
};

type ClientMetadata = {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
};

type AuthorizationCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
  accessToken: string;
  expiresAt: Date;
};

@UseInterceptors(NoCacheInterceptor)
@Controller()
export class McpOAuthController {
  private readonly logger = new Logger(McpOAuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  @Get(".well-known/oauth-protected-resource")
  protectedResource(@Req() request: Request) {
    const baseUrl = this.baseUrl(request);
    return {
      resource: `${baseUrl}/api/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      resource_documentation: `${baseUrl}/api/mcp`,
      scopes_supported: ["mcp", "offline_access"]
    };
  }

  @Get(".well-known/oauth-authorization-server")
  authorizationServer(@Req() request: Request) {
    const baseUrl = this.baseUrl(request);
    this.logger.log(`OAuth metadata requested: issuer=${baseUrl} resource=${baseUrl}/api/mcp`);
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ["mcp"]
    };
  }

  @Post("oauth/register")
  async registerClient(@Body() body: ClientRegistration) {
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((value) => typeof value === "string" && this.isAllowedRedirectUri(value))
      : [];

    const requestedScope = this.normalizeScope(body.scope);
    const requestedGrantTypes = ["authorization_code", "refresh_token"];

    if (redirectUris.length === 0) {
      throw new UnauthorizedException("At least one valid OAuth redirect URI is required");
    }

    const clientId = `empanada_mcp_${randomUUID()}`;
    await this.prisma.mcpOAuthClient.create({
      data: {
        clientId,
        clientName: typeof body.client_name === "string" ? body.client_name : undefined,
        redirectUris
      }
    });

    this.logger.log(`OAuth client registered: clientId=${clientId} redirectCount=${redirectUris.length}`);

    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: requestedGrantTypes,
      response_types: ["code"],
      scope: requestedScope
    };
  }

  @Get("oauth/authorize")
  @Header("Content-Type", "text/html; charset=utf-8")
  async authorizeForm(
    @Query("client_id") clientId: string,
    @Query("redirect_uri") redirectUri: string,
    @Query("state") state: string | undefined,
    @Query("code_challenge") codeChallenge: string | undefined,
    @Query("code_challenge_method") codeChallengeMethod: string | undefined,
    @Query("resource") resource: string | undefined,
    @Query("scope") scope: string | undefined,
    @Res() response: Response
  ) {
    const client = await this.resolveClient(clientId);
    this.assertRegisteredRedirectUri(client, redirectUri);
    const requestedScope = this.normalizeScope(scope);
    const validatedResource = this.assertMcpResource(resource, this.baseUrlFromRequest(response.req));
    this.logger.log(
      `OAuth authorize form: clientId=${clientId} redirectUri=${this.safeUrl(redirectUri)} resource=${validatedResource} state=${state ? "present" : "missing"} pkce=${codeChallengeMethod ?? "none"}`
    );
    response.send(
      this.renderSignInForm({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        resource: validatedResource,
        scope: requestedScope
      })
    );
  }

  @Post("oauth/authorize")
  async authorize(
    @Body()
    body: {
      client_id?: string;
      redirect_uri?: string;
      state?: string;
      code_challenge?: string;
      code_challenge_method?: string;
      resource?: string;
      scope?: string;
      email?: string;
      password?: string;
    },
    @Req() request: Request,
    @Res() response: Response
  ) {
    const clientId = body.client_id ?? "";
    const redirectUri = body.redirect_uri ?? "";
    const client = await this.resolveClient(clientId);
    this.assertRegisteredRedirectUri(client, redirectUri);

    const resource = this.assertMcpResource(body.resource, this.baseUrl(request));
    const requestedScope = this.normalizeScope(body.scope);
    this.logger.log(
      `OAuth authorize submit: clientId=${clientId} redirectUri=${this.safeUrl(redirectUri)} resource=${resource} state=${body.state ? "present" : "missing"} pkce=${body.code_challenge_method ?? "none"}`
    );

    if (body.code_challenge && body.code_challenge_method !== "S256") {
      throw new UnauthorizedException("OAuth PKCE S256 is required");
    }

    let login: Awaited<ReturnType<AuthService["login"]>>;
    try {
      login = await this.auth.login({ email: body.email ?? "", password: body.password ?? "" });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        response.status(401).send(
          this.renderSignInForm({
            clientId,
            redirectUri,
            state: body.state,
            codeChallenge: body.code_challenge,
            codeChallengeMethod: body.code_challenge_method,
            resource,
            scope: requestedScope,
            error: "Invalid Empanada Hauz email or password."
          })
        );
        return;
      }

      this.logger.error(`OAuth login failed unexpectedly: ${this.errorMessage(error)}`);
      throw error;
    }

    try {
      const code = randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60_000);

      await this.prisma.mcpOAuthAuthorizationCode.create({
        data: {
          code,
          clientId,
          redirectUri,
          codeChallenge: body.code_challenge,
          codeChallengeMethod: body.code_challenge_method,
          scope: requestedScope,
          accessToken: login.accessToken,
          expiresAt,
          consumedAt: null
        }
      });

      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (body.state) {
        redirect.searchParams.set("state", body.state);
      }
      redirect.searchParams.set("iss", this.baseUrl(request));

      this.logger.log(
        `OAuth authorization succeeded: clientId=${clientId} redirectUri=${this.safeUrl(redirectUri)} issuer=${this.baseUrl(request)} code=present`
      );
      response.redirect(redirect.toString());
    } catch (error) {
      this.logger.error(`OAuth authorization code creation failed: ${this.errorMessage(error)}`);
      throw error;
    }
  }

  @Post("oauth/token")
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async token(
    @Body()
    body: {
      grant_type?: string;
      code?: string;
      refresh_token?: string;
      redirect_uri?: string;
      client_id?: string;
      code_verifier?: string;
      resource?: string;
      scope?: string;
    },
    @Req() request: Request
  ) {
    this.logger.log(
      `OAuth token request: grantType=${body.grant_type ?? "missing"} clientId=${body.client_id ?? "missing"} redirectUri=${body.redirect_uri ? this.safeUrl(body.redirect_uri) : "missing"} resource=${body.resource ?? "missing"} code=${body.code ? "present" : "missing"} verifier=${body.code_verifier ? "present" : "missing"}`
    );

    if (body.grant_type === "refresh_token") {
      return this.refreshAccessToken(body.client_id, body.refresh_token, body.scope, body.resource, request);
    }

    if (body.grant_type !== "authorization_code" || !body.code) {
      throw new UnauthorizedException("Unsupported OAuth grant");
    }

    const resource = this.assertMcpResource(body.resource, this.baseUrl(request));

    const entry = await this.prisma.mcpOAuthAuthorizationCode.findUnique({
      where: { code: body.code }
    });

    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      this.logger.warn(`OAuth token rejected: code ${entry ? "expired" : "not found"}`);
      throw new UnauthorizedException("Authorization code is invalid or expired");
    }

    if (entry.clientId !== body.client_id || entry.redirectUri !== body.redirect_uri) {
      this.logger.warn(`OAuth token rejected: client or redirect URI mismatch for clientId=${body.client_id ?? "missing"}`);
      throw new UnauthorizedException("OAuth client mismatch");
    }

    if (!this.verifyPkce(entry, body.code_verifier)) {
      this.logger.warn(`OAuth token rejected: PKCE verification failed for clientId=${body.client_id ?? "missing"}`);
      throw new UnauthorizedException("OAuth PKCE verification failed");
    }

    // Mint the token BEFORE touching consumption state — minting is pure/in-process and
    // doesn't depend on winning the claim below. What matters is that the WINNING token
    // gets persisted atomically in the same write that claims the code, so a losing
    // concurrent/retried request can hand back the exact token the winner got instead of
    // guessing from timing (clock skew and ordering gaps across serverless instances made
    // an earlier timing-window approach unreliable).
    let accessToken: string;
    let tokenPayload: { sub?: string; email?: string; role?: string };
    try {
      tokenPayload = await this.jwt.verifyAsync<{
        sub?: string;
        email?: string;
        role?: string;
      }>(entry.accessToken);

      if (!tokenPayload.sub) {
        throw new UnauthorizedException("Invalid OAuth access token");
      }

      accessToken = await this.jwt.signAsync({
        sub: tokenPayload.sub,
        email: tokenPayload.email,
        role: tokenPayload.role,
        aud: resource
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error(`MCP access token creation failed: ${this.errorMessage(error)}`);
      throw new UnauthorizedException("Invalid OAuth access token");
    }

    const decoded = this.jwt.decode(accessToken) as { sub?: string; aud?: string | string[]; iat?: number; exp?: number } | null;
    this.logger.log(
      `OAuth token created: tokenType=Bearer tokenLength=${accessToken.length} sub=${decoded?.sub ? "present" : "missing"} aud=${Array.isArray(decoded?.aud) ? decoded.aud.join(",") : decoded?.aud ?? "missing"} iat=${decoded?.iat ?? "missing"} exp=${decoded?.exp ?? "missing"} expiresIn=${this.jwtExpiresInSeconds()} resource=${resource}`
    );

    const claimedAt = new Date();
    const claim = await this.prisma.mcpOAuthAuthorizationCode.updateMany({
      where: {
        code: body.code,
        consumedAt: null,
        expiresAt: { gt: claimedAt }
      },
      data: { consumedAt: claimedAt, issuedAccessToken: accessToken }
    });

    if (claim.count === 1) {
      const scope = this.normalizeScope(entry.scope);
      const refreshToken = await this.createRefreshToken(tokenPayload.sub!, body.client_id!, scope);
      this.logger.log(`OAuth token response: status=success tokenType=Bearer scope=${scope} expiresIn=${this.jwtExpiresInSeconds()}`);
      return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: this.jwtExpiresInSeconds(),
        refresh_token: refreshToken,
        scope
      };
    }

    // Lost the claim — someone else (a concurrent request or an earlier retry of this
    // same exchange) already consumed this code. If it was this same client/redirect,
    // hand back whatever token they got instead of failing a legitimate retry.
    const current = await this.prisma.mcpOAuthAuthorizationCode.findUnique({ where: { code: body.code } });
    if (current?.issuedAccessToken && current.clientId === body.client_id && current.redirectUri === body.redirect_uri) {
      this.logger.warn(`OAuth token: reusing previously issued token for a retried exchange (clientId=${body.client_id ?? "missing"})`);
      return {
        access_token: current.issuedAccessToken,
        token_type: "Bearer",
        expires_in: this.jwtExpiresInSeconds(),
        scope: "mcp"
      };
    }

    this.logger.warn(`OAuth token rejected: authorization code was already consumed for clientId=${body.client_id ?? "missing"}`);
    throw new UnauthorizedException("Authorization code is invalid or already used");
  }

  private assertRegisteredRedirectUri(client: ClientMetadata, redirectUri: string) {
    if (!redirectUri || !client.redirect_uris.includes(redirectUri)) throw new UnauthorizedException("OAuth redirect URI is not registered");
  }

  private async resolveClient(clientId: string): Promise<ClientMetadata> {
    if (!clientId) throw new UnauthorizedException("OAuth client_id is required");
    if (clientId.startsWith("https://")) return this.fetchClientMetadata(clientId);
    const client = await this.prisma.mcpOAuthClient.findUnique({ where: { clientId } });
    if (!client) throw new UnauthorizedException("Unknown OAuth client");
    const redirectUris = Array.isArray(client.redirectUris) ? client.redirectUris.filter((value): value is string => typeof value === "string") : [];
    return { client_id: client.clientId, client_name: client.clientName ?? undefined, redirect_uris: redirectUris };
  }

  private async fetchClientMetadata(clientId: string): Promise<ClientMetadata> {
    let url: URL;
    try { url = new URL(clientId); } catch { throw new UnauthorizedException("Invalid client metadata URL"); }
    if (url.protocol !== "https:" || this.isPrivateHostname(url.hostname)) throw new UnauthorizedException("Client metadata URL must be a public HTTPS URL");
    let response: globalThis.Response;
    try { response = await fetch(url, { redirect: "error", headers: { accept: "application/json" } }); }
    catch { throw new UnauthorizedException("Unable to fetch client metadata"); }
    if (!response.ok) throw new UnauthorizedException("Client metadata request failed");
    let metadata: ClientMetadata;
    try { metadata = (await response.json()) as ClientMetadata; } catch { throw new UnauthorizedException("Client metadata is not valid JSON"); }
    if (metadata.client_id !== clientId || !Array.isArray(metadata.redirect_uris) || metadata.redirect_uris.length === 0) throw new UnauthorizedException("Client metadata is invalid");
    const redirectUris = metadata.redirect_uris.filter((value) => typeof value === "string" && this.isAllowedRedirectUri(value));
    if (redirectUris.length !== metadata.redirect_uris.length) throw new UnauthorizedException("Client metadata contains an invalid redirect URI");
    return { ...metadata, redirect_uris: redirectUris };
  }

  private isPrivateHostname(hostname: string) {
    const value = hostname.toLowerCase();
    return value === "localhost" || value.endsWith(".localhost") || value === "::1" ||
      /^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) ||
      /^169\.254\./.test(value) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
  }

  private normalizeScope(scope?: string) {
    const values = (scope ?? "mcp offline_access").split(/\s+/).filter(Boolean);
    const allowed = new Set(["mcp", "offline_access"]);
    if (values.some((value) => !allowed.has(value))) throw new UnauthorizedException("Unsupported OAuth scope");
    return [...new Set(values)].join(" ");
  }

  private async createRefreshToken(userId: string, clientId: string, scope: string) {
    const raw = randomUUID() + randomUUID();
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    await this.prisma.mcpOAuthRefreshToken.create({ data: { tokenHash, clientId, userId, scope, expiresAt } });
    return raw;
  }

  private async refreshAccessToken(clientId: string | undefined, refreshToken: string | undefined, scope: string | undefined, resource: string | undefined, request: Request) {
    if (!clientId || !refreshToken) throw new UnauthorizedException("Refresh token and client_id are required");
    await this.resolveClient(clientId);
    const validatedResource = this.assertMcpResource(resource, this.baseUrl(request));
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const current = await this.prisma.mcpOAuthRefreshToken.findUnique({ where: { tokenHash } });
    if (!current || current.revokedAt || current.expiresAt.getTime() <= Date.now() || current.clientId !== clientId) throw new UnauthorizedException("Refresh token is invalid or expired");
    const requestedScope = this.normalizeScope(scope);
    const originalScope = this.normalizeScope(current.scope);
    const originalSet = new Set(originalScope.split(" "));
    if (requestedScope.split(" ").some(value => !originalSet.has(value))) throw new UnauthorizedException("Requested scope exceeds the originally granted scope");
    const user = await this.prisma.user.findUnique({ where: { id: current.userId }, select: { id: true, email: true, role: true } });
    if (!user) throw new UnauthorizedException("MCP user account was not found");
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, aud: validatedResource });
    const newRefreshToken = await this.createRefreshToken(user.id, clientId, originalScope);
    await this.prisma.mcpOAuthRefreshToken.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
    return { access_token: accessToken, token_type: "Bearer", expires_in: this.jwtExpiresInSeconds(), refresh_token: newRefreshToken, scope: originalScope };
  }

  private isAllowedRedirectUri(value: string) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:") return true;
      if (url.protocol !== "http:") return false;
      return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    } catch {
      return false;
    }
  }

  private assertMcpResource(resource: string | undefined, baseUrl: string) {
    const expected = `${baseUrl}/api/mcp`;
    if (!resource) {
      throw new UnauthorizedException("OAuth resource is required");
    }

    let parsed: URL;
    try {
      parsed = new URL(resource);
    } catch {
      throw new UnauthorizedException("OAuth resource is invalid");
    }

    if (parsed.toString() !== expected) {
      throw new UnauthorizedException("OAuth resource does not match the MCP endpoint");
    }

    return parsed.toString();
  }

  private verifyPkce(entry: AuthorizationCode, codeVerifier?: string) {
    if (!entry.codeChallenge) {
      return true;
    }

    if (!codeVerifier || entry.codeChallengeMethod !== "S256") {
      return false;
    }

    const hash = createHash("sha256").update(codeVerifier).digest("base64url");
    return hash === entry.codeChallenge;
  }

  private jwtExpiresInSeconds() {
    const value = process.env.JWT_EXPIRES_IN ?? "1d";
    if (/^\d+$/.test(value)) return Number(value);
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) return 24 * 60 * 60;
    const amount = Number(match[1]);
    const unit = match[2];
    if (unit === "s") return amount;
    if (unit === "m") return amount * 60;
    if (unit === "h") return amount * 60 * 60;
    return amount * 24 * 60 * 60;
  }

  private baseUrl(request: Request) {
    const proto = request.header("x-forwarded-proto")?.split(",")[0]?.trim() || request.protocol;
    const host = request.header("x-forwarded-host")?.split(",")[0]?.trim() || request.get("host");
    return `${proto}://${host}`;
  }

  private baseUrlFromRequest(request: Request) {
    return this.baseUrl(request);
  }

  private safeUrl(value: string) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return "invalid-url";
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private renderSignInForm(input: {
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    resource: string;
    error?: string;
  }) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Empanada Hauz MCP Sign In</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #f8fafc; font-family: Arial, sans-serif; }
    main { width: min(420px, calc(100vw - 32px)); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; background: #161d2f; padding: 24px; box-shadow: 0 24px 70px rgba(0,0,0,.42); }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 20px; color: rgba(248,250,252,.68); line-height: 1.5; }
    label { display: block; margin: 14px 0 6px; font-size: 13px; font-weight: 700; color: rgba(248,250,252,.82); }
    input { box-sizing: border-box; width: 100%; height: 44px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: #0f172a; color: #fff; padding: 0 12px; font-size: 15px; }
    button { margin-top: 18px; width: 100%; height: 44px; border: 0; border-radius: 8px; background: #ef6637; color: #fff; font-weight: 800; cursor: pointer; }
    .error { margin-bottom: 14px; border: 1px solid rgba(248,113,113,.35); border-radius: 8px; background: rgba(127,29,29,.32); padding: 10px 12px; color: #fecaca; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <h1>Empanada Hauz</h1>
    <p>Sign in with your Empanada Hauz staff account to authorize the MCP connector.</p>
    ${input.error ? `<div class="error">${this.escapeHtml(input.error)}</div>` : ""}
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${this.escapeHtml(input.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${this.escapeHtml(input.redirectUri)}" />
      <input type="hidden" name="state" value="${this.escapeHtml(input.state ?? "")}" />
      <input type="hidden" name="code_challenge" value="${this.escapeHtml(input.codeChallenge ?? "")}" />
      <input type="hidden" name="code_challenge_method" value="${this.escapeHtml(input.codeChallengeMethod ?? "")}" />
      <input type="hidden" name="resource" value="${this.escapeHtml(input.resource)}" />
      <input type="hidden" name="scope" value="${this.escapeHtml(input.scope ?? "mcp")}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Authorize MCP</button>
    </form>
  </main>
</body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
}
