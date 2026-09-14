import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

type ErrorLike = {
  code?: string;
  message?: string;
  name?: string;
  stack?: string;
};

type MinimalRequest = {
  method?: string;
  url?: string;
};

type MinimalResponse = {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<MinimalResponse>();
    const request = ctx.getRequest<MinimalRequest>();
    const normalized = this.normalize(exception);

    if (normalized.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const error = this.asErrorLike(exception);
      this.logger.error(
        `${request.method ?? "REQUEST"} ${request.url ?? ""} failed: ${error.message ?? normalized.message}`,
        error.stack
      );
    }

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      error: normalized.error,
      message: normalized.message,
      path: request.url,
      timestamp: new Date().toISOString()
    });
  }

  private normalize(exception: unknown) {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      return {
        statusCode,
        error: this.errorLabel(statusCode),
        message: this.extractMessage(body) ?? exception.message
      };
    }

    const error = this.asErrorLike(exception);
    const prisma = this.normalizePrismaError(error);
    if (prisma) return prisma;

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: this.errorLabel(HttpStatus.INTERNAL_SERVER_ERROR),
      message: "Something went wrong. Please try again."
    };
  }

  private normalizePrismaError(error: ErrorLike) {
    const message = error.message ?? "";

    if (error.code === "P2002" || message.includes("E11000 duplicate key")) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: this.errorLabel(HttpStatus.CONFLICT),
        message: "A record with the same unique value already exists."
      };
    }

    if (error.code === "P2025") {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        error: this.errorLabel(HttpStatus.NOT_FOUND),
        message: "The requested record was not found."
      };
    }

    if (
      error.code === "P1000" ||
      error.code === "P1001" ||
      error.code === "P1002" ||
      message.includes("AuthenticationFailed") ||
      message.includes("SCRAM failure") ||
      message.includes("server selection timeout") ||
      message.includes("unreachable network")
    ) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: this.errorLabel(HttpStatus.SERVICE_UNAVAILABLE),
        message: "The database is temporarily unavailable. Please check the connection settings and try again."
      };
    }

    if (error.name?.includes("Prisma") || message.includes("Prisma")) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: this.errorLabel(HttpStatus.INTERNAL_SERVER_ERROR),
        message: "A database error occurred. Please try again."
      };
    }

    return null;
  }

  private extractMessage(body: unknown) {
    if (typeof body === "string") return body;
    if (!body || typeof body !== "object") return null;
    const value = (body as { message?: unknown }).message;
    if (Array.isArray(value)) return value.join(", ");
    return typeof value === "string" ? value : null;
  }

  private errorLabel(statusCode: number) {
    return HttpStatus[statusCode] ?? "Error";
  }

  private asErrorLike(value: unknown): ErrorLike {
    if (value && typeof value === "object") return value as ErrorLike;
    return { message: String(value) };
  }
}
