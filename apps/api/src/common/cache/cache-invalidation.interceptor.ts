import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { CacheService } from "./cache.service";

@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInvalidationInterceptor.name);

  // Read-side exclusions must also be excluded from mutation invalidation.
  // These endpoints either must not use the application cache or have their
  // own protocol/session semantics (MCP, OAuth, webhooks, health, sockets).
  private readonly excludedPrefixes = [
    "/api/mcp",
    "/oauth/",
    "/.well-known/",
    "/webhook",
    "/messenger/",
    "/health",
    "/api/health",
    "/socket.io/"
  ];

  constructor(private readonly cache: CacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<any>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      return next.handle();
    }

    const path = String(request.originalUrl ?? request.url ?? "").split("?")[0];
    if (this.excludedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix))) {
      return next.handle();
    }

    // Invalidate only after a successful mutation. Invalidating before the
    // database write creates unnecessary cache churn and can let a concurrent
    // GET repopulate the cache with the old database state while the mutation
    // is still in progress. The post-mutation invalidation closes that window.
    //
    // Cache invalidation is deliberately best-effort: Redis being unavailable
    // must never make a successful order/customer/etc. mutation fail.
    return next.handle().pipe(
      tap(() => {
        void this.invalidateSafely();
      })
    );
  }

  private async invalidateSafely() {
    try {
      await this.cache.invalidateAll();
    } catch (error) {
      this.logger.debug(
        `Cache invalidation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
