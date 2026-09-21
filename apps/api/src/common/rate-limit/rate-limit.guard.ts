import {
  ExecutionContext,
  Injectable,
  TooManyRequestsException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitConfig
} from "./rate-limit.decorator";
import { RateLimitService } from "./rate-limit.service";

const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_SECONDS = 60;

interface RequestWithUser extends Request {
  user?: {
    id?: string;
    sub?: string;
  };
}

@Injectable()
export class RateLimitGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.method === "OPTIONS") return true;

    const config =
      this.reflector.getAllAndOverride<RateLimitConfig>(
        RATE_LIMIT_METADATA_KEY,
        [context.getHandler(), context.getClass()]
      ) ?? {
        limit: DEFAULT_LIMIT,
        windowSeconds: DEFAULT_WINDOW_SECONDS,
        key: "ip"
      };

    if (config.skip) return true;

    const identity = this.identity(request, config.key ?? "ip");
    const scope = this.scope(request);
    const bucketKey = `${scope}:${identity}`;
    const result = await this.rateLimitService.consume(
      bucketKey,
      config.limit,
      config.windowSeconds
    );

    response.setHeader("RateLimit-Limit", String(result.limit));
    response.setHeader("RateLimit-Remaining", String(result.remaining));
    response.setHeader(
      "RateLimit-Reset",
      String(Math.ceil(result.resetAt / 1000))
    );

    if (!result.allowed) {
      response.setHeader("Retry-After", String(result.retryAfterSeconds));
      throw new TooManyRequestsException(
        "Too many requests. Please wait a moment and try again."
      );
    }

    return true;
  }

  private identity(
    request: RequestWithUser,
    key: RateLimitConfig["key"]
  ) {
    const userId = request.user?.id ?? request.user?.sub;

    if (key === "user" && userId) return `user:${userId}`;
    if (key === "user_or_ip" && userId) return `user:${userId}`;

    return `ip:${this.clientIp(request)}`;
  }

  private clientIp(request: RequestWithUser) {
    return (
      request.ip ||
      request.headers["x-real-ip"]?.toString().split(",")[0]?.trim() ||
      request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      request.socket.remoteAddress ||
      "unknown"
    );
  }

  private scope(request: RequestWithUser) {
    return `route:${request.method}:${(request.originalUrl ?? request.url).split("?")[0]}`;
  }
}
