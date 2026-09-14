import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { FraudService } from "./fraud.service";

@Injectable()
export class FraudOrderInterceptor implements NestInterceptor {
  constructor(private readonly fraudService: FraudService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string; body?: any }>();
    if (request.method !== "POST") return next.handle();

    const path = (request.originalUrl ?? "").split("?")[0];
    if (!(path === "/api/orders" || path === "/api/orders/manual" || path === "/api/orders/public")) return next.handle();

    if (path === "/api/orders/public") {
      return from(this.checkPublicOrder(request.body)).pipe(
        mergeMap(() => next.handle())
      );
    }

    return next.handle().pipe(
      mergeMap((result: any) => from(this.detect(result)).pipe(
        mergeMap((fraud) => {
          if (!result || typeof result !== "object") return from(Promise.resolve(result));
          return from(Promise.resolve({ ...result, fraud }));
        }),
        catchError(() => from(Promise.resolve(result)))
      ))
    );
  }

  private async checkPublicOrder(body: any) {
    const fraud = await this.fraudService.checkPublicCustomer({
      name: body?.customerName,
      phoneNumber: body?.phoneNumber,
      address: body?.address,
      location: body?.landmark
    });

    if (fraud.blocked) {
      throw new BadRequestException({
        code: "ORDER_BLOCKED_FRAUD",
        message: "We’re unable to accept this order. Please contact Empanada Hauz support.",
        fraud: {
          severity: fraud.highestSeverity,
          matches: fraud.matches.map((match) => ({ score: match.score, matchedOn: match.matchedOn }))
        }
      });
    }
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
