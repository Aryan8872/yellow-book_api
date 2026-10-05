import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// Infrastructure
import { RedisModule } from './infrastructure/redis/redis.module';
import { MetricsModule } from './infrastructure/metrics/metrics.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';

// Domain Modules
import { AuthModule } from './modules/auth/auth.module';
import { RedemptionModule } from './modules/redemption/redemption.module';
import { OfferModule } from './modules/offer/offer.module';
import { CategoryModule } from './modules/category/category.module';
import { UploadModule } from './modules/upload/upload.module';
import { MerchantModule } from './modules/merchant/merchant.module';

// Common
import { HealthController } from './common/health/health.controller';
import { CorrelationIdMiddleware } from './common/middlewares/correlation-id.middleware';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { ApiKeyGuard } from './modules/auth/guards/api-key.guard';
import { ThrottlerStorageRedisService } from './common/throttler/throttler-storage-redis.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:standard',
                },
              }
            : undefined,
        autoLogging: {
          ignore: (req) =>
            Boolean(
              req.url &&
              (req.url.includes('/health') || req.url.includes('/metrics')),
            ),
        },
        serializers: {
          req(req) {
            return {
              id: req.id,
              method: req.method,
              url: req.url,
              correlationId: req.raw?.correlationId,
            };
          },
        },
      },
    }),

    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ThrottlerStorageRedisService],
      useFactory: (storage: ThrottlerStorageRedisService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 100,
          },
          {
            name: 'redemption',
            ttl: 60000,
            limit: 20,
          },
        ],
        storage,
      }),
    }),

    RedisModule,
    PrismaModule,
    MetricsModule,
    AuthModule,
    RedemptionModule,
    OfferModule,
    CategoryModule,
    UploadModule,
    MerchantModule,
  ],
  controllers: [HealthController],
  providers: [
    ThrottlerStorageRedisService,
    // 1. Throttler Guard (Sliding window rate limit)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // 2. Machine-to-Machine API Key Guard (checks @RequireApiKey routes)
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    // 3. User JWT Guard (Respects @Public)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 4. Role-Based Access Control Guard (@Roles)
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Metrics measurement
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    // Idempotency execution lock & replay
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    // Standardized uniform success response
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
