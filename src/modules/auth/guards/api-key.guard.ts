import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { API_KEY_PROTECTED_KEY } from '../auth.decorators';
import { AppErrorCode } from '../../../common/constants/error-codes';
import type { Request } from 'express';

export const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isApiKeyProtected = this.reflector.getAllAndOverride<boolean>(
      API_KEY_PROTECTED_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If route doesn't require API key, allow request through to next guard
    if (!isApiKeyProtected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers[API_KEY_HEADER] as string;

    if (!apiKey) {
      throw new UnauthorizedException({
        message: 'Missing required x-api-key header',
        errorCode: AppErrorCode.API_KEY_MISSING,
      });
    }

    const validApiKeys = (
      this.config.get<string>('SERVER_API_KEYS') ||
      'dev-internal-api-key-offernepal,partner-api-key-test'
    )
      .split(',')
      .map((k) => k.trim());

    if (!validApiKeys.includes(apiKey)) {
      throw new UnauthorizedException({
        message: 'Invalid x-api-key provided',
        errorCode: AppErrorCode.API_KEY_INVALID,
      });
    }

    return true;
  }
}
