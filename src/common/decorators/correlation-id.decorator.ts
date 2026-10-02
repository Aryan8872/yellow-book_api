import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CORRELATION_ID_HEADER } from '../middlewares/correlation-id.middleware';

/**
 * Extracts correlation ID from request headers.
 */
export const CorrelationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return (
      (request.headers[CORRELATION_ID_HEADER] as string) ||
      request.correlationId ||
      'unknown'
    );
  },
);
