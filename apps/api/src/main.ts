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

  // OAuth clients such as Claude send token and authorization form submissions
  // as application/x-www-form-urlencoded. Use Nest's parser so rawBody remains
  // available for webhook HMAC verification.
  app.useBodyParser("urlencoded", { extended: false, limit: "100kb" });

  const httpServer = app.getHttpAdapter().getInstance();

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

  // MCP requires a real HTTP 401 challenge when the protected resource is
  // called without a bearer token. Returning the OAuth error directly here
  // avoids Nest's generic UnauthorizedException response from obscuring the
  // challenge that MCP hosts use to start/restart OAuth discovery.
  httpServer.use((req: any, res: any, next: any) => {
    const path = typeof req.path === "string" ? req.path : "";
    if (path !== "/api/mcp" || typeof req.headers.authorization === "string") {
      next();
      return;
    }

    const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol;
    const host = req.headers["x-forwarded-host"]?.split(",")[0]?.trim() || req.get("host");
    const baseUrl = `${proto}://${host}`;
    const resourceMetadata = `${baseUrl}/.well-known/oauth-protected-resource`;

    res.status(401);
    res.setHeader(
      "WWW-Authenticate",
      `Bearer error="invalid_token", error_description="Authentication required", resource_metadata="${resourceMetadata}"`
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      error: "invalid_token",
      error_description: "Authentication required"
    });
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
