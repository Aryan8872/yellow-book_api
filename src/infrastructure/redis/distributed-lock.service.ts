import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { v4 as uuidv4 } from 'uuid';

export interface LockResult {
  acquired: boolean;
  lockId: string;
  release: () => Promise<boolean>;
}

@Injectable()
export class DistributedLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Acquire a distributed lock with automatic expiration (lease time).
   * Prevents double-spend redemptions and concurrent checkout clashes.
   */
  async acquireLock(resource: string, ttlMs = 5000): Promise<LockResult> {
    const lockId = uuidv4();
    const key = `lock:${resource}`;

    try {
      const result = await this.redis.set(key, lockId, 'PX', ttlMs, 'NX');
      const acquired = result === 'OK';

      const release = async (): Promise<boolean> => {
        // Lua script to safely release lock only if lockId matches (prevents releasing someone else's lock)
        const luaScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const res = await this.redis.eval(luaScript, 1, key, lockId);
        return res === 1;
      };

      return { acquired, lockId, release };
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to query distributed lock: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Run an asynchronous critical section under a distributed lock.
   */
  async runWithLock<T>(
    resource: string,
    ttlMs: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const lock = await this.acquireLock(resource, ttlMs);
    if (!lock.acquired) {
      throw new Error(
        `Resource [${resource}] is currently locked by another operation.`,
      );
    }

    try {
      return await action();
    } finally {
      await lock.release();
    }
  }
}
