import { Injectable, Inject } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    const rateLimitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;

    try {
      const isBlockedRaw = await this.redis.get(blockKey);
      if (isBlockedRaw) {
        const timeToBlockExpire = await this.redis.ttl(blockKey);
        return {
          totalHits: limit + 1,
          timeToExpire: timeToBlockExpire,
          isBlocked: true,
          timeToBlockExpire,
        };
      }

      const multi = this.redis.multi();
      multi.incr(rateLimitKey);
      multi.ttl(rateLimitKey);
      const results = await multi.exec();

      let totalHits = 1;
      let timeToExpire = ttl;

      if (results && results[0] && results[0][1]) {
        totalHits = Number(results[0][1]);
      }
      if (results && results[1] && results[1][1]) {
        const currentTtl = Number(results[1][1]);
        if (currentTtl === -1) {
          await this.redis.expire(rateLimitKey, Math.ceil(ttl / 1000));
          timeToExpire = Math.ceil(ttl / 1000);
        } else {
          timeToExpire = currentTtl;
        }
      }

      if (totalHits > limit && blockDuration > 0) {
        await this.redis.set(
          blockKey,
          '1',
          'EX',
          Math.ceil(blockDuration / 1000),
        );
        return {
          totalHits,
          timeToExpire,
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDuration / 1000),
        };
      }

      return {
        totalHits,
        timeToExpire,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    } catch {
      return {
        totalHits: 1,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
