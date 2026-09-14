import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { mergeMap } from "rxjs/operators";
import { PrismaService } from "../../database/prisma.service";
import { FraudService } from "./fraud.service";

const FRAUD_SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

@Injectable()
export class FraudRiderInterceptor implements NestInterceptor {
  constructor(
    private readonly fraudService: FraudService,
    private readonly prisma: PrismaService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string; body?: any }>();
    if (request.method !== "PATCH") return next.handle();

    const path = (request.originalUrl ?? "").split("?")[0];
    const match = path.match(/^\/api\/delivery-network\/jobs\/([^/]+)\/assign$/);
    if (!match) return next.handle();

    const deliveryJobId = match[1];
    return from(this.precheck(deliveryJobId, request.body?.riderId)).pipe(
      mergeMap((fraud) => from(next.handle()).pipe(
        mergeMap((result: any) => {
          if (!result || typeof result !== "object") return from(Promise.resolve(result));
          return from(Promise.resolve({ ...result, fraud }));
        })
      ))
    );
  }

  private async precheck(deliveryJobId: string, riderId?: string) {
    if (!riderId?.trim()) return { matched: false, matches: [] };

    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        vehicles: { where: { isActive: true } }
      }
    });

    if (!rider) return { matched: false, matches: [] };

    const fraud = await this.fraudService.detectRiderAssignment({
      deliveryJobId,
      riderId,
      rider
    });

    const blocked = fraud.matches.some((match) => (FRAUD_SEVERITY_RANK[match.severity] ?? 0) >= FRAUD_SEVERITY_RANK.high);
    if (blocked) {
      throw new BadRequestException({
        code: "RIDER_ASSIGNMENT_BLOCKED_FRAUD",
        message: "This rider cannot be assigned because the rider is flagged for fraud review.",
        fraud: {
          severity: fraud.highestSeverity,
          matches: fraud.matches.map((match) => ({ score: match.score, matchedOn: match.matchedOn }))
        }
      });
    }

    return fraud;
  }
}
