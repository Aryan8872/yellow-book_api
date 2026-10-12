import { Injectable, Inject, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../redis/redis.constants';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CacheService {
  // In-memory LRU-like fallback when Redis is unavailable or disconnected
  private readonly memoryCache = new Map<string, CacheEntry<unknown>>();
  private readonly MAX_MEMORY_ENTRIES = 500;

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext('CacheService');
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        const raw = await this.redis.get(key);
        if (raw) {
          return JSON.parse(raw) as T;
        }
        return null;
      } catch (err: unknown) {
        this.logger.warn({ key, err: (err as Error).message }, '[Cache] Redis get failed, checking memory fallback');
      }
    }

    // Memory fallback check
    const entry = this.memoryCache.get(key);
    if (entry) {
      if (Date.now() < entry.expiresAt) {
        return entry.value as T;
      }
      this.memoryCache.delete(key);
    }

    return null;
  }

  async set<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      } catch (err: unknown) {
        this.logger.warn({ key, err: (err as Error).message }, '[Cache] Redis set failed, storing in memory fallback');
      }
    }

    // Store in memory fallback as well for resilience
    if (this.memoryCache.size >= this.MAX_MEMORY_ENTRIES) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.del(key);
      } catch (err: unknown) {
        this.logger.warn({ key, err: (err as Error).message }, '[Cache] Redis del failed');
      }
    }
    this.memoryCache.delete(key);
  }

  async deletePattern(pattern: string): Promise<void> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (err: unknown) {
        this.logger.warn({ pattern, err: (err as Error).message }, '[Cache] Redis deletePattern failed');
      }
    }

    // Clear matching memory keys
    const regex = new RegExp(`^${pattern.replace('*', '.*')}`);
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  async wrap<T>(key: string, fn: () => Promise<T>, ttlSeconds = 60): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
