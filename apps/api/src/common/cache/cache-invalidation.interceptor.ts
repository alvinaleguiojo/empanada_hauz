import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { CacheService } from "./cache.service";

@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInvalidationInterceptor.name);

  // Same exclusion list as CacheInterceptor's read-side: OAuth/MCP/webhook/health
  // traffic must never depend on the cache layer's availability. This interceptor
  // previously had no exclusions at all, so every mutation on these paths -
  // including MCP OAuth registration/token exchange - was blocked on an
  // await'd call into this service before the real handler even ran.
  private readonly excludedPrefixes = ["/api/mcp", "/oauth/", "/.well-known/", "/webhook", "/messenger/", "/health", "/api/health", "/socket.io/"];

  constructor(private readonly cache: CacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<any>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next.handle();

    const path = String(request.originalUrl ?? request.url ?? "").split("?")[0];
    if (this.excludedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix))) {
      return next.handle();
    }

    // Fire-and-forget rather than await: cache invalidation is a best-effort
    // optimization, and a slow/unreachable cache backend (e.g. Redis unavailable
    // in this serverless environment) must never be able to stall a real mutation
    // waiting on it. CacheService already falls back internally on error/timeout;
    // we just make sure that fallback path can never block the request pipeline.
    this.invalidateSafely("pre-mutation");

    return next.handle().pipe(
      tap(() => {
        this.invalidateSafely("post-mutation");
      })
    );
  }

  private invalidateSafely(when: string) {
    void this.cache.invalidateAll().catch((error) => {
      this.logger.debug(`Cache invalidation (${when}) failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
