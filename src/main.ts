import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { Logger } from "nestjs-pino";
import { VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import compression from "compression";
import * as path from "path";
import * as fs from "fs";
import cookieParser from "cookie-parser";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { createValidationPipe } from "./common/pipes/validation.pipe";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Increase payload size limit for large image uploads
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  // Serve local uploads folder statically for development & local driver
  const uploadsDirectory = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDirectory)) {
    fs.mkdirSync(uploadsDirectory, { recursive: true });
  }
  app.useStaticAssets(uploadsDirectory, {
    prefix: "/uploads/",
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

  // Cookie Parser for HttpOnly cookie authentication
  app.use(cookieParser());

  // Strict CORS configuration
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // If development environment or no explicit origins set, allow all origins
      if (process.env.NODE_ENV !== 'production' || allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-correlation-id',
      'x-api-key',
      'idempotency-key',
      'x-client-version',
    ],
  });

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
      "Omni-channel Voucher, BOGO, & Subscription Engine modeled after The ENTERTAINER.\n\n" +
      "**Authentication:**\n" +
      "- JWT tokens can be sent via `Authorization: Bearer <token>` header\n" +
      "- Or via HttpOnly cookie named `accessToken` (recommended for web apps)\n" +
      "- Use `x-api-key` header for M2M/partner integrations",
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "JWT",
        description:
          "Enter Bearer Token for Customer/Merchant/Admin authentication (or use HttpOnly cookie)",
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
