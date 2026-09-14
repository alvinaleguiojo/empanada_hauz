import { Body, Controller, Get, Header, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { AuthService } from "../auth/auth.service";

type ClientRegistration = {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
};

type AuthorizationCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
  accessToken: string;
  expiresAt: Date;
};

@Controller()
export class McpOAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService
  ) {}

  @Get(".well-known/oauth-protected-resource")
  protectedResource(@Req() request: Request) {
    const baseUrl = this.baseUrl(request);
    return {
      resource: `${baseUrl}/api/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      resource_documentation: `${baseUrl}/api/mcp`
    };
  }

  @Get(".well-known/oauth-authorization-server")
  authorizationServer(@Req() request: Request) {
    const baseUrl = this.baseUrl(request);
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp"]
    };
  }

  @Post("oauth/register")
  async registerClient(@Body() body: { redirect_uris?: string[]; client_name?: string }) {
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((value) => typeof value === "string" && this.isAllowedRedirectUri(value))
      : [];

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

    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: "mcp"
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
    @Res() response: Response
  ) {
    await this.assertRegisteredRedirectUri(clientId, redirectUri);
    response.send(this.renderSignInForm({ clientId, redirectUri, state, codeChallenge, codeChallengeMethod }));
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
      email?: string;
      password?: string;
    },
    @Res() response: Response
  ) {
    const clientId = body.client_id ?? "";
    const redirectUri = body.redirect_uri ?? "";
    await this.assertRegisteredRedirectUri(clientId, redirectUri);

    if (body.code_challenge && body.code_challenge_method !== "S256") {
      throw new UnauthorizedException("OAuth PKCE S256 is required");
    }

    try {
      const login = await this.auth.login({ email: body.email ?? "", password: body.password ?? "" });
      const code = randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60_000);

      await this.prisma.mcpOAuthAuthorizationCode.create({
        data: {
          code,
          clientId,
          redirectUri,
          codeChallenge: body.code_challenge,
          codeChallengeMethod: body.code_challenge_method,
          accessToken: login.accessToken,
          expiresAt
        }
      });

      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (body.state) {
        redirect.searchParams.set("state", body.state);
      }

      response.redirect(redirect.toString());
    } catch {
      response.status(401).send(
        this.renderSignInForm({
          clientId,
          redirectUri,
          state: body.state,
          codeChallenge: body.code_challenge,
          codeChallengeMethod: body.code_challenge_method,
          error: "Invalid Empanada Hauz email or password."
        })
      );
    }
  }

  @Post("oauth/token")
  async token(
    @Body()
    body: {
      grant_type?: string;
      code?: string;
      redirect_uri?: string;
      client_id?: string;
      code_verifier?: string;
    }
  ) {
    if (body.grant_type !== "authorization_code" || !body.code) {
      throw new UnauthorizedException("Unsupported OAuth grant");
    }

    const entry = await this.prisma.mcpOAuthAuthorizationCode.findUnique({
      where: { code: body.code }
    });

    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Authorization code is invalid or expired");
    }

    if (entry.clientId !== body.client_id || entry.redirectUri !== body.redirect_uri) {
      throw new UnauthorizedException("OAuth client mismatch");
    }

    if (!this.verifyPkce(entry, body.code_verifier)) {
      throw new UnauthorizedException("OAuth PKCE verification failed");
    }

    const consumedAt = new Date();
    const consumed = await this.prisma.mcpOAuthAuthorizationCode.updateMany({
      where: {
        code: body.code,
        consumedAt: null,
        expiresAt: { gt: consumedAt }
      },
      data: { consumedAt }
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedException("Authorization code is invalid or already used");
    }

    await this.prisma.mcpOAuthAuthorizationCode.delete({ where: { code: body.code } });

    return {
      access_token: entry.accessToken,
      token_type: "Bearer",
      expires_in: this.jwtExpiresInSeconds(),
      scope: "mcp"
    };
  }

  private async assertRegisteredRedirectUri(clientId: string, redirectUri: string) {
    const client = await this.prisma.mcpOAuthClient.findUnique({
      where: { clientId }
    });

    if (!client) {
      throw new UnauthorizedException("Unknown OAuth client");
    }

    const redirectUris = Array.isArray(client.redirectUris)
      ? client.redirectUris.filter((value): value is string => typeof value === "string")
      : [];

    if (!redirectUri || !redirectUris.includes(redirectUri)) {
      throw new UnauthorizedException("OAuth redirect URI is not registered");
    }
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

  private renderSignInForm(input: {
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
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
