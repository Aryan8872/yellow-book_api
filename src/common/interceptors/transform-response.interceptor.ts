import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middlewares/correlation-id.middleware';
import { AppErrorCode } from '../constants/error-codes';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  errorCode: AppErrorCode;
  message?: string;
  data: T;
  meta?: Record<string, any>;
  timestamp: string;
  correlationId?: string;
}

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const httpCtx = context.switchToHttp();
    const response = httpCtx.getResponse<Response>();
    const request = httpCtx.getRequest<Request>();

    // Skip wrapping if response is Prometheus metrics or raw binary stream
    if (request.url.includes('/metrics')) {
      return next.handle();
    }

    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string) ||
      (request as any).correlationId;

    return next.handle().pipe(
      map((result) => {
        let message = 'Operation completed successfully';
        let data = result;
        let meta: Record<string, any> | undefined;

        if (result && typeof result === 'object' && 'data' in result) {
          data = result.data;
          message = result.message || message;
          meta = result.meta;
        }

        return {
          success: true,
          statusCode: response.statusCode,
          errorCode: AppErrorCode.SUCCESS,
          message,
          data,
          ...(meta ? { meta } : {}),
          timestamp: new Date().toISOString(),
          correlationId,
        };
      }),
    );
  }
}
