import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { PrismaService } from "../../database/prisma.service";
import { FraudService } from "./fraud.service";

const FRAUD_SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

@Injectable()
export class FraudOrderInterceptor implements NestInterceptor {
  constructor(
    private readonly fraudService: FraudService,
    private readonly prisma: PrismaService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string; body?: any }>();
    if (request.method !== "POST") return next.handle();

    const path = (request.originalUrl ?? "").split("?")[0];
    if (!(path === "/api/orders" || path === "/api/orders/manual" || path === "/api/orders/public")) return next.handle();

    return from(this.precheck(path, request.body)).pipe(
      mergeMap(() => next.handle()),
      mergeMap((result: any) => from(this.detect(result)).pipe(
        mergeMap((fraud) => {
          if (!result || typeof result !== "object") return from(Promise.resolve(result));
          return from(Promise.resolve({ ...result, fraud }));
        }),
        catchError(() => from(Promise.resolve(result)))
      ))
    );
  }

  private async precheck(path: string, body: any) {
    const fraud = path === "/api/orders"
      ? await this.checkAuthenticatedCustomer(body?.customerId)
      : await this.fraudService.checkPublicCustomer({
          name: body?.customerName,
          phoneNumber: body?.phoneNumber,
          address: body?.address,
          location: body?.landmark
        });

    if (fraud?.blocked) {
      throw new BadRequestException({
        code: "ORDER_BLOCKED_FRAUD",
        message: "We’re unable to accept this order. Please contact Empanada Hauz support.",
        fraud: {
          severity: fraud.highestSeverity,
          matches: fraud.matches.map((match) => ({ score: match.score, matchedOn: match.matchedOn }))
        }
      });
    }

    return fraud;
  }

  private async checkAuthenticatedCustomer(customerId?: string) {
    if (!customerId?.trim()) return { matched: false, blocked: false, highestSeverity: null, matches: [] };

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return { matched: false, blocked: false, highestSeverity: null, matches: [] };

    const directCases = await this.prisma.fraudCase.findMany({
      where: { entityType: "customer", status: "open", subjectId: customer.id },
      take: 50
    });
    const directMatches = directCases.map((fraudCase) => ({
      caseId: fraudCase.id,
      severity: fraudCase.severity,
      score: 100,
      matchedOn: ["customerId"],
      reason: fraudCase.reason
    }));

    const identity = await this.fraudService.checkPublicCustomer({
      name: customer.name,
      phoneNumber: customer.phoneNumber,
      address: customer.defaultAddress,
      location: null
    });

    const matches = [...directMatches, ...(identity.matches ?? [])];
    const highestSeverity = matches
      .map((match) => match.severity)
      .sort((a, b) => (FRAUD_SEVERITY_RANK[b] ?? 0) - (FRAUD_SEVERITY_RANK[a] ?? 0))[0] ?? null;

    return {
      matched: matches.length > 0,
      blocked: matches.some((match) => (FRAUD_SEVERITY_RANK[match.severity] ?? 0) >= FRAUD_SEVERITY_RANK.high),
      highestSeverity,
      matches
    };
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
