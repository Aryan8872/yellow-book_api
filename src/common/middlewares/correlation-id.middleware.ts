import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.headers[CORRELATION_ID_HEADER] as string;
    const correlationId = existingId || uuidv4();

    // Attach to request object for downstream controllers and services
    req.headers[CORRELATION_ID_HEADER] = correlationId;
    (req as any).correlationId = correlationId;

    // Send back to client for distributed tracing / support debugging
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
