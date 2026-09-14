import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, of } from "rxjs";
import { tap } from "rxjs/operators";
import { CacheService } from "./cache.service";

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: CacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<any>();
    const response = context.switchToHttp().getResponse<any>();

    if (!this.shouldCache(request)) return next.handle();

    const key = this.buildKey(request);
    const cached = await this.cache.get<unknown>(key);

    if (cached !== undefined) {
      response.setHeader("X-Cache", "HIT");
      response.setHeader("Cache-Control", `private, max-age=${this.cache.getTtlSeconds()}`);
      return of(cached);
    }

    response.setHeader("X-Cache", "MISS");
    return next.handle().pipe(
      tap((body) => {
        if (response.statusCode >= 200 && response.statusCode < 300 && body !== undefined) {
          void this.cache.set(key, body);
        }
      })
    );
  }

  private shouldCache(request: any): boolean {
    if (request.method !== "GET") return false;
    if (request.headers?.["cache-control"]?.includes("no-store")) return false;
    if (request.headers?.accept?.includes("text/event-stream")) return false;

    const path = String(request.originalUrl ?? request.url ?? "").split("?")[0];
    const excluded = [
      "/api/mcp",
      "/oauth/",
      "/.well-known/",
      "/webhook",
      "/messenger/",
      "/health",
      "/api/health",
      "/api/docs",
      "/socket.io/",
      "/track",
      "/location",
      "/live",
      "/status"
    ];

    return !excluded.some((prefix) => path === prefix || path.startsWith(prefix));
  }

  private buildKey(request: any): string {
    const userId = request.user?.id ?? request.user?.sub ?? "anonymous";
    const query = request.originalUrl?.includes("?") ? request.originalUrl.split("?")[1] : "";
    return `http:${request.method}:${request.path}:${userId}:${query}`;
  }
}
