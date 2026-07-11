import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "../src/app.module";
import { resolveCorsOrigin } from "../src/common/cors";

const server = express();
let initialized = false;

async function bootstrap() {
  if (initialized) {
    return server;
  }

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    cors: {
      origin: resolveCorsOrigin,
      credentials: true
    }
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  await app.init();
  initialized = true;
  return server;
}

export default async function handler(request: express.Request, response: express.Response) {
  const app = await bootstrap();
  return app(request, response);
}
