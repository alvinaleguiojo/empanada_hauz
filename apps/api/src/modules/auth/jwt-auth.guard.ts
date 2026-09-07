import { ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import type { UserRole } from "@prisma/client";
import { hasPermission, permissionForRequest } from "./permissions";

type AuthenticatedRequest = Request & { user?: { role?: string } };

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) {
      return false;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role as UserRole | undefined;
    const permission = permissionForRequest(request.method, request.originalUrl ?? request.url);

    if (!role || !permission) {
      return true;
    }

    if (!hasPermission(role, permission)) {
      throw new ForbiddenException(`Permission required: ${permission}`);
    }

    return true;
  }
}
