import express from "express";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { resolveCorsOrigin } from "./common/cors";
import { assertSecureRuntimeConfig } from "./common/security-config";
import { CacheService } from "./common/cache/cache.service";
import { CacheInterceptor } from "./common/cache/cache.interceptor";
import { CacheInvalidationInterceptor } from "./common/cache/cache-invalidation.interceptor";

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
      { path: ".well-known/openid-configuration", method: RequestMethod.GET },
      { path: "oauth/register", method: RequestMethod.POST },
      { path: "oauth/authorize", method: RequestMethod.GET },
      { path: "oauth/authorize", method: RequestMethod.POST },
      { path: "oauth/token", method: RequestMethod.POST }
    ]
  });

  // OAuth clients such as Claude send token and authorization form submissions
  // as application/x-www-form-urlencoded. Use Express's parser while keeping
  // rawBody enabled for webhook HMAC verification.
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  const httpServer = app.getHttpAdapter().getInstance();

  // Safe diagnostics for remote MCP/OAuth connectivity. We intentionally log
  // only method/path/content type, body field names, header names/presence,
  // response status, and whether a challenge exists. Never log credentials,
  // authorization codes, PKCE verifiers, refresh tokens, or access tokens.
  httpServer.use((req: any, res: any, next: any) => {
    const path = typeof req.path === "string" ? req.path : "";
    const isRemoteMcpPath =
      path === "/api/mcp" ||
      path.startsWith("/.well-known/") ||
      path.startsWith("/oauth/");

    if (!isRemoteMcpPath) {
      next();
      return;
    }

    const bodyKeys = req.body && typeof req.body === "object" ? Object.keys(req.body) : [];
    const headerNames = Object.keys(req.headers).sort();
    const hasAuthorization = typeof req.headers.authorization === "string";
    const startedAt = Date.now();

    console.log(
      `[Remote MCP] ${req.method} ${path} content-type=${req.headers["content-type"] ?? "none"} body-keys=${bodyKeys.join(",") || "none"} authorization=${hasAuthorization ? "present" : "missing"} header-names=${headerNames.join(",") || "none"}`
    );

    res.once("finish", () => {
      const challenge = res.getHeader("www-authenticate");
      console.log(
        `[Remote MCP] ${req.method} ${path} -> ${res.statusCode} content-type=${res.getHeader("content-type") ?? "none"} www-authenticate=${challenge ? "present" : "missing"} durationMs=${Date.now() - startedAt}`
      );
    });

    next();
  });

  // Let the MCP transport initialize and expose tool security metadata. OAuth is
  // enforced inside each tool handler so ChatGPT can receive the MCP runtime
  // error containing _meta["mcp/www_authenticate"], which triggers its OAuth UI.

  const cache = app.get(CacheService);
  app.useGlobalInterceptors(
    new CacheInterceptor(cache),
    new CacheInvalidationInterceptor(cache)
  );

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
