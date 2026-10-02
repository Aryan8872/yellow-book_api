import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';
import { PinoLogger } from 'nestjs-pino';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly defaultTtlSeconds = 86400; // 24 hours

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Only apply idempotency to state-mutating requests (POST, PATCH, PUT, DELETE)
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return next.handle();
    }

    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER] as string;
    if (!idempotencyKey) {
      return next.handle();
    }

    const redisKey = `idempotency:${req.method}:${req.path}:${idempotencyKey}`;

    try {
      const cached = await this.redis.get(redisKey);

      if (cached) {
        const parsed = JSON.parse(cached);

        if (parsed.status === 'IN_PROGRESS') {
          throw new ConflictException(
            'A request with this Idempotency-Key is currently being processed. Please retry shortly.',
          );
        }

        // Return historical recorded response
        res.setHeader('X-Cache', 'IDEMPOTENT-HIT');
        res.status(parsed.statusCode || 200);
        return of(parsed.body);
      }

      // Mark request as IN_PROGRESS with a short lock TTL (60s) to prevent concurrent duplicate execution
      await this.redis.set(
        redisKey,
        JSON.stringify({ status: 'IN_PROGRESS' }),
        'EX',
        60,
      );

      return next.handle().pipe(
        tap({
          next: async (data) => {
            try {
              // Cache successful response for 24 hours
              await this.redis.set(
                redisKey,
                JSON.stringify({
                  status: 'RESOLVED',
                  statusCode: res.statusCode,
                  body: data,
                }),
                'EX',
                this.defaultTtlSeconds,
              );
            } catch (err: any) {
              this.logger.warn(
                { err: err.message },
                '[Idempotency] Failed to cache final response',
              );
            }
          },
          error: async () => {
            // Remove in-progress lock so client can safely retry on failure
            try {
              await this.redis.del(redisKey);
            } catch (err: any) {
              this.logger.warn(
                { err: err.message },
                '[Idempotency] Failed to release lock on error',
              );
            }
          },
        }),
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        throw err;
      }
      this.logger.warn(
        { err: (err as any).message },
        '[Idempotency] Redis error, continuing with fallback execution',
      );
      return next.handle();
    }
  }
}
