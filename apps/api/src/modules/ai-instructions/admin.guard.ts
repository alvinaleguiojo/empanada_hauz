import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

type AuthenticatedRequest = Request & { user?: { role?: string } };

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    return true;
  }
}
