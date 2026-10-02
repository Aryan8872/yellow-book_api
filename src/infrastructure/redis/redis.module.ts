import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { DistributedLockService } from './distributed-lock.service';
import { REDIS_CLIENT } from './redis.constants';
import { ThrottlerStorageRedisService } from '../../common/throttler/throttler-storage-redis.service';

export * from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService, PinoLogger],
      useFactory: (config: ConfigService, logger: PinoLogger): Redis => {
        const redisUrl =
          config.get<string>('REDIS_URL') || 'redis://127.0.0.1:6379';

        const client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            const delay = Math.min(times * 100, 3000);
            return delay;
          },
          lazyConnect: true,
          enableReadyCheck: true,
        });

        client.on('connect', () => {
          logger.info('[Redis] Connecting to Redis instance...');
        });

        client.on('ready', () => {
          logger.info('[Redis] Redis client connected and ready.');
        });

        client.on('error', (err) => {
          logger.error({ err }, '[Redis] Redis connection error');
        });

        client.connect().catch((err) => {
          logger.warn(
            { err: err.message },
            '[Redis] Note: Redis not reachable yet, running with fallback tolerance',
          );
        });

        return client;
      },
    },
    DistributedLockService,
    ThrottlerStorageRedisService,
  ],
  exports: [REDIS_CLIENT, DistributedLockService, ThrottlerStorageRedisService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    this.logger.info('[Redis] Gracefully closing Redis connection...');
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
