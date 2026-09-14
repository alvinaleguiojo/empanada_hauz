import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { FraudService } from "./fraud.service";

@Injectable()
export class FraudRiderInterceptor implements NestInterceptor {
  constructor(private readonly fraudService: FraudService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string }>();
    if (request.method !== "PATCH") return next.handle();

    const path = (request.originalUrl ?? "").split("?")[0];
    if (!/^\/api\/delivery-network\/jobs\/[^/]+\/assign$/.test(path)) return next.handle();

    return next.handle().pipe(
      mergeMap((result: any) => from(this.detect(result)).pipe(
        mergeMap((fraud) => from(Promise.resolve({ ...result, fraud }))),
        catchError(() => from(Promise.resolve(result)))
      ))
    );
  }

  private async detect(job: any) {
    if (!job?.id || !job?.riderId) return { matched: false, matches: [] };
    try {
      return await this.fraudService.detectRiderAssignment({
        deliveryJobId: job.id,
        riderId: job.riderId,
        rider: job.rider
      });
    } catch {
      return { matched: false, matches: [], detectionError: true };
    }
  }
}
