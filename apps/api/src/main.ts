import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { resolveCorsOrigin } from "./common/cors";
import { assertSecureRuntimeConfig } from "./common/security-config";

async function bootstrap() {
  assertSecureRuntimeConfig();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: {
      origin: resolveCorsOrigin,
      credentials: true
    }
  });

  app.setGlobalPrefix("api", {
    exclude: [
      { path: ".well-known/oauth-protected-resource", method: RequestMethod.GET },
      { path: ".well-known/oauth-authorization-server", method: RequestMethod.GET },
      { path: "oauth/register", method: RequestMethod.POST },
      { path: "oauth/authorize", method: RequestMethod.GET },
      { path: "oauth/authorize", method: RequestMethod.POST },
      { path: "oauth/token", method: RequestMethod.POST }
    ]
  });

  const express = require("express");
  const httpServer = app.getHttpAdapter().getInstance();

  // OAuth clients such as Claude send token and authorization form submissions
  // as application/x-www-form-urlencoded. Keep this parser before Nest routes.
  httpServer.use(express.urlencoded({ extended: false, limit: "100kb" }));
  httpServer.use(express.json({ limit: "15mb" }));

  // Safe diagnostics for remote MCP/OAuth connectivity. We intentionally log
  // only the method/path/content type, body field names, and header names/presence,
  // never credentials, authorization codes, PKCE verifiers, or access tokens.
  httpServer.use((req: any, _res: any, next: any) => {
    const path = typeof req.path === "string" ? req.path : "";
    if (path === "/api/mcp" || path.startsWith("/.well-known/") || path.startsWith("/oauth/")) {
      const bodyKeys = req.body && typeof req.body === "object" ? Object.keys(req.body) : [];
      const headerNames = Object.keys(req.headers).sort();
      const hasAuthorization = typeof req.headers.authorization === "string";
      console.log(
        `[Remote MCP] ${req.method} ${path} content-type=${req.headers["content-type"] ?? "none"} body-keys=${bodyKeys.join(",") || "none"} authorization=${hasAuthorization ? "present" : "missing"} header-names=${headerNames.join(",") || "none"}`
      );
    }
    next();
  });

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  await app.listen(Number(process.env.APP_PORT ?? 4000));
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Bootstrap] API failed to start: ${message}`);
  process.exit(1);
});
