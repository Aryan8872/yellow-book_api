import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "nestjs-pino";
import { VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { createValidationPipe } from "./common/pipes/validation.pipe";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Attach Pino Logger as application logger
  const pinoLogger = app.get(Logger);
  app.useLogger(pinoLogger);

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Gzip / Brotli Payload Compression
  app.use(compression());

  // Strict CORS configuration

  // app.enableCors({
  //   origin: (origin, callback) => {
  //     const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  //       .split(',')
  //       .map((s) => s.trim())
  //       .filter(Boolean);

  //     if (
  //       !origin ||
  //       allowedOrigins.length === 0 ||
  //       allowedOrigins.includes(origin)
  //     ) {
  //       callback(null, true);
  //     } else {
  //       callback(null, true);
  //     }
  //   },
  //   credentials: true,
  //   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  //   allowedHeaders: [
  //     'Content-Type',
  //     'Authorization',
  //     'x-correlation-id',
  //     'x-api-key',
  //     'idempotency-key',
  //     'x-client-version',
  //   ],
  // });

  // Global API Prefix & URI Versioning (e.g. /api/v1/...)
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // Global Uniform Validation Pipe (Shapes field-by-field validation errors with AppErrorCode.VALIDATION_FAILED)
  app.useGlobalPipes(createValidationPipe());

  // Global RFC 7807 Error Filter (handles HttpExceptions, ValidationPipe errors, and Prisma exceptions)
  app.useGlobalFilters(new AllExceptionsFilter());

  // OpenAPI / Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle("OfferNepal Enterprise API")
    .setDescription(
      "Omni-channel Voucher, BOGO, & Subscription Engine modeled after The ENTERTAINER.",
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "JWT",
        description:
          "Enter Bearer Token for Customer/Merchant/Admin authentication",
        in: "header",
      },
      "JWT-auth",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "x-api-key",
        in: "header",
        description:
          "Server API Key for M2M, webhooks, and partner integrations",
      },
      "x-api-key",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  pinoLogger.log(
    `🚀 OfferNepal Engine running on port ${port} (Swagger docs at /docs)`,
  );
}

bootstrap();
