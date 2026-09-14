import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PrismaService } from "../../database/prisma.service";

type McpUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

type McpAccessTokenPayload = {
  sub?: string;
  aud?: string | string[];
};

@Injectable()
export class McpAuthService {
  private readonly logger = new Logger(McpAuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async authenticateAuthorizationHeader(authorization: string | undefined, request: Request): Promise<McpUser> {
    const token = this.extractBearerToken(authorization);
    if (!token) {
      this.logger.warn("MCP auth rejected: missing Bearer token");
      throw new UnauthorizedException("MCP authentication is required");
    }

    let payload: McpAccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<McpAccessTokenPayload>(token);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MCP auth rejected: JWT verification failed (${reason})`);
      throw new UnauthorizedException("Invalid MCP access token");
    }

    const expectedAudience = this.mcpResource(request);
    if (!this.hasAudience(payload.aud, expectedAudience)) {
      this.logger.warn("MCP auth rejected: JWT audience does not match the MCP resource");
      throw new UnauthorizedException("Invalid MCP access token");
    }

    if (!payload.sub) {
      this.logger.warn("MCP auth rejected: JWT has no subject");
      throw new UnauthorizedException("Invalid MCP access token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      this.logger.warn("MCP auth rejected: JWT subject does not match a user");
      throw new UnauthorizedException("MCP user account was not found");
    }

    this.logger.log("MCP auth accepted: JWT user authenticated");
    return user;
  }

  private extractBearerToken(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim();
  }

  private hasAudience(audience: string | string[] | undefined, expected: string) {
    return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
  }

  private mcpResource(request: Request) {
    // Derived the same way McpOAuthController computes the "resource" it puts in the
    // token's `aud` claim at issuance time, so verification always matches issuance
    // regardless of apex/www or proxy header differences. Falls back to the old
    // env-var-based resource (if configured) for backward compatibility.
    const proto = request.header("x-forwarded-proto")?.split(",")[0]?.trim() || request.protocol;
    const host = request.header("x-forwarded-host")?.split(",")[0]?.trim() || request.get("host");
    if (proto && host) return `${proto}://${host}/api/mcp`;

    const baseUrl = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
    if (baseUrl) return `${baseUrl}/api/mcp`;

    const publicUrl = process.env.API_PUBLIC_URL?.replace(/\/$/, "");
    if (publicUrl) return `${publicUrl}/api/mcp`;

    throw new UnauthorizedException("MCP public resource is not configured");
  }
}
