import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { FraudService } from "./fraud.service";

@Injectable()
export class FraudOrderInterceptor implements NestInterceptor {
  constructor(private readonly fraudService: FraudService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string }>();
    if (request.method !== "POST") return next.handle();

    const path = (request.originalUrl ?? "").split("?")[0];
    if (!(path === "/api/orders" || path === "/api/orders/manual" || path === "/api/orders/public")) return next.handle();
    const exposeDetection = path !== "/api/orders/public";

    return next.handle().pipe(
      mergeMap((result: any) => from(this.detect(result)).pipe(
        mergeMap((fraud) => {
          if (!exposeDetection || !result || typeof result !== "object") return from(Promise.resolve(result));
          return from(Promise.resolve({ ...result, fraud }));
        }),
        catchError(() => from(Promise.resolve(result)))
      ))
    );
  }

  private async detect(result: any) {
    const order = result?.order ?? result;
    if (!order?.id) return { matched: false, matches: [] };
    try {
      return await this.fraudService.detectCustomerOrder(order);
    } catch {
      return { matched: false, matches: [], detectionError: true };
    }
  }
}
