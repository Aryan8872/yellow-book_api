import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    // Exempt administrators from rate limiting
    if (req.user && req.user.role === 'ADMIN') {
      return true;
    }
    return super.canActivate(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If authenticated user exists, throttle per user ID
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }

    // Support proxy / X-Forwarded-For headers
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
      const clientIp = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : forwarded[0]?.trim();
      if (clientIp) return `ip:${clientIp}`;
    }

    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    return `ip:${ip}`;
  }
}
