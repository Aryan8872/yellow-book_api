import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from '../../infrastructure/metrics/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (req.url.includes('/metrics')) {
      return next.handle();
    }

    const start = process.hrtime();
    const method = req.method;
    const route = req.route?.path || req.path || 'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          const [seconds, nanoseconds] = process.hrtime(start);
          const durationInSeconds = seconds + nanoseconds / 1e9;
          const statusCode = String(res.statusCode);

          this.metrics.httpRequestsTotal.inc({
            method,
            route,
            status_code: statusCode,
          });
          this.metrics.httpRequestDurationMicroseconds.observe(
            { method, route, status_code: statusCode },
            durationInSeconds,
          );
        },
        error: (err: any) => {
          const [seconds, nanoseconds] = process.hrtime(start);
          const durationInSeconds = seconds + nanoseconds / 1e9;
          const statusCode = String(err.status || 500);

          this.metrics.httpRequestsTotal.inc({
            method,
            route,
            status_code: statusCode,
          });
          this.metrics.httpRequestDurationMicroseconds.observe(
            { method, route, status_code: statusCode },
            durationInSeconds,
          );
        },
      }),
    );
  }
}
