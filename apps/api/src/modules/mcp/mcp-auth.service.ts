import { Injectable, UnauthorizedException } from "@nestjs/common";
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
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async authenticateAuthorizationHeader(authorization?: string): Promise<McpUser> {
    const token = this.extractBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException("MCP authentication is required");
    }

    const legacyToken = process.env.MCP_BEARER_TOKEN?.trim();
    if (legacyToken && token === legacyToken) {
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
    } catch {
      throw new UnauthorizedException("Invalid MCP access token");
    }

    if (!payload.sub) {
      throw new UnauthorizedException("Invalid MCP access token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      throw new UnauthorizedException("MCP user account was not found");
    }

    return user;
  }

  private extractBearerToken(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim();
  }
}
