import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, AuthenticatedUser } from '../auth.types';
import { mapPrismaRoleToAppRole } from '../auth.utils';
import type { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secretOrKey = config.get<string>('JWT_SECRET');
    if (!secretOrKey) {
      // Fail fast at boot rather than silently signing with a known secret.
      throw new Error('JWT_SECRET environment variable is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          return req?.cookies?.accessToken || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid or expired token payload');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: mapPrismaRoleToAppRole(payload.role as any),
      merchantId: payload.merchantId,
      subscriptionActive: payload.subscriptionActive,
    };
  }
}
