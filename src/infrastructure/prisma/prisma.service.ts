import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 *
 * A singleton NestJS wrapper around PrismaClient with:
 *  - Graceful connect on startup and disconnect on shutdown
 *  - Query duration logging in development
 *  - Soft-delete middleware ($extends coming in Prisma v5+, middleware used for compatibility)
 *  - Connection pooling managed by PgBouncer / Railway Postgres (set DATABASE_URL accordingly)
 *
 * Usage: Import PrismaModule in any module that needs DB access.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
      errorFormat: 'minimal',
    });

    // Log slow queries in development for performance awareness
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).$on('query', (event: any) => {
        const duration = event.duration as number;
        if (duration > 100) {
          this.logger.warn(
            `Slow query (${duration}ms): ${event.query.substring(0, 100)}...`,
          );
        } else {
          this.logger.debug(`Query (${duration}ms): ${event.query.substring(0, 80)}`);
        }
      });
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('✅ Prisma connected to database');
    } catch (error) {
      this.logger.error('❌ Prisma failed to connect to database', error);
      // In production, exit process so Railway/orchestrator restarts the container
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from database');
  }

  /**
   * Utility: Checks if the database is reachable (used in health checks)
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Soft-delete helper: filters out records with deletedAt != null.
   * Manually call this filter in queries until Prisma v5 row-level extension is stable.
   */
  get activeUser() {
    return this.user.findMany({
      where: { deletedAt: null },
    });
  }
}
