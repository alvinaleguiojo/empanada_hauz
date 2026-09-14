import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../database/prisma.service";

type McpUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

@Injectable()
export class McpAuthService {
  private readonly logger = new Logger(McpAuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async authenticateAuthorizationHeader(authorization?: string): Promise<McpUser> {
    const token = this.extractBearerToken(authorization);
    if (!token) {
      this.logger.warn("MCP auth rejected: missing Bearer token");
      throw new UnauthorizedException("MCP authentication is required");
    }

    const legacyToken = process.env.MCP_BEARER_TOKEN?.trim();
    if (legacyToken && token === legacyToken) {
      this.logger.log("MCP auth accepted: legacy bearer token");
      return {
        id: "mcp-legacy-token",
        email: "mcp@empanadahauz.local",
        name: "MCP Legacy Token",
        role: "admin"
      };
    }

    let payload: { sub?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MCP auth rejected: JWT verification failed (${reason})`);
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
}
