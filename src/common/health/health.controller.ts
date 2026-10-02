import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';
import { Public } from '../../modules/auth/auth.decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  @Public()
  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe for Railway / Kubernetes' })
  getLiveness() {
    return {
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe checking Redis and dependencies' })
  async getReadiness() {
    let redisStatus = 'UNKNOWN';
    try {
      const ping = await this.redis.ping();
      redisStatus = ping === 'PONG' ? 'UP' : 'DEGRADED';
    } catch {
      redisStatus = 'DOWN';
    }

    return {
      status: redisStatus === 'UP' ? 'UP' : 'PARTIAL_OUTAGE',
      checks: {
        redis: redisStatus,
        api: 'UP',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
