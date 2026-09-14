import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { CacheService } from "./cache.service";

@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  constructor(private readonly cache: CacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<any>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next.handle();

    // Clear before and after a mutation. Clearing before prevents a request
    // from serving a value that was already stale when the write started;
    // clearing after closes the race where a concurrent GET repopulates the
    // cache while the mutation is running.
    await this.cache.invalidateAll();

    return next.handle().pipe(
      tap(() => {
        void this.cache.invalidateAll();
      })
    );
  }
}
