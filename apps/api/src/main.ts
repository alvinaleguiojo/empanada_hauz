import { ValidationPipe } from "@nestjs/common";
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

  app.setGlobalPrefix("api");
  app.getHttpAdapter().getInstance().use(require("express").json({ limit: "15mb" }));
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
