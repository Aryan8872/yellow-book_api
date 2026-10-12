import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middlewares/correlation-id.middleware';
import { AppErrorCode } from '../constants/error-codes';
import { Sentry } from '../sentry/sentry.setup';

export interface ValidationErrorDetail {
  field: string;
  rejectedValue?: any;
  constraints: Record<string, string>;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  errorCode: AppErrorCode | string;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
  correlationId?: string;
  details?: Record<string, any> | ValidationErrorDetail[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string) ||
      (request as any).correlationId;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: AppErrorCode | string = AppErrorCode.INTERNAL_SERVER_ERROR;
    let errorMessage: string | string[] = 'Internal server error';
    let errorTitle = 'Internal Server Error';
    let details: Record<string, any> | ValidationErrorDetail[] | undefined;

    // 1. Handle NestJS HttpExceptions (including standard ValidationPipe)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        errorMessage = exceptionResponse;
        errorCode = this.mapStatusToErrorCode(statusCode);
        errorTitle = exception.name;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resp = exceptionResponse as any;
        errorMessage = resp.message || exception.message;
        errorTitle = resp.error || exception.name;
        errorCode = resp.errorCode || this.mapStatusToErrorCode(statusCode);
        details = resp.details;

        if (resp.errorCode === AppErrorCode.VALIDATION_FAILED) {
          errorCode = AppErrorCode.VALIDATION_FAILED;
        }
      }
    }
    // 2. Handle Prisma Database Exceptions
    else if (this.isPrismaClientError(exception)) {
      const prismaHandled = this.handlePrismaError(exception);
      statusCode = prismaHandled.statusCode;
      errorCode = prismaHandled.errorCode;
      errorTitle = prismaHandled.errorTitle;
      errorMessage = prismaHandled.errorMessage;
      // In production/client response, we do NOT leak raw details like table names or query parameters
      details = undefined;
    }
    // 3. Handle Standard JavaScript / Unhandled Errors
    else if (exception instanceof Error) {
      errorMessage = 'An unexpected error occurred. Please try again later.';
      errorTitle = 'Internal Server Error';
      errorCode = AppErrorCode.INTERNAL_SERVER_ERROR;
      details = undefined;
    }

    const payload: ApiErrorResponse = {
      success: false,
      statusCode,
      errorCode,
      error: errorTitle,
      message: errorMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
      ...(details ? { details } : {}),
    };

    // Structured logging with correlation ID and trace — Full diagnostics preserved server-side
    const rawExceptionDetails =
      exception instanceof Error
        ? { message: exception.message, stack: exception.stack }
        : exception;

    if (statusCode >= 500) {
      this.logger.error(
        `[ServerError] ${request.method} ${request.url} | correlationId: ${correlationId} | statusCode: ${statusCode} | ${JSON.stringify(rawExceptionDetails)}`,
      );
    } else {
      this.logger.warn(
        `[ClientError] ${request.method} ${request.url} | correlationId: ${correlationId} | statusCode: ${statusCode} | ${JSON.stringify(errorMessage)}`,
      );
    }

    // Report unexpected server errors to Sentry with request context.
    if (statusCode >= 500 && Sentry.isInitialized()) {
      Sentry.withScope((scope) => {
        scope.setTag('correlationId', correlationId ?? 'unknown');
        scope.setLevel('error');
        scope.setContext('http', {
          method: request.method,
          url: request.url,
          statusCode,
          errorCode,
        });
        Sentry.captureException(exception);
      });
    }

    response.status(statusCode).json(payload);
  }

  private mapStatusToErrorCode(status: number): AppErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return AppErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return AppErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return AppErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return AppErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return AppErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return AppErrorCode.TOO_MANY_REQUESTS;
      default:
        return AppErrorCode.INTERNAL_SERVER_ERROR;
    }
  }

  private isPrismaClientError(exception: any): boolean {
    return (
      exception &&
      (exception.constructor?.name?.startsWith('PrismaClient') ||
        Boolean(
          exception.code &&
            typeof exception.code === 'string' &&
            exception.code.startsWith('P'),
        ))
    );
  }

  private handlePrismaError(exception: any): {
    statusCode: number;
    errorCode: AppErrorCode;
    errorTitle: string;
    errorMessage: string;
  } {
    const code = exception.code;

    switch (code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          errorCode: AppErrorCode.DB_UNIQUE_CONSTRAINT_VIOLATION,
          errorTitle: 'Conflict',
          errorMessage: 'A record with this information already exists.',
        };

      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          errorCode: AppErrorCode.DB_RECORD_NOT_FOUND,
          errorTitle: 'Not Found',
          errorMessage: 'The requested resource could not be found.',
        };

      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: AppErrorCode.DB_FOREIGN_KEY_VIOLATION,
          errorTitle: 'Invalid Reference',
          errorMessage: 'The requested action references an entity that does not exist.',
        };

      case 'P2007':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: AppErrorCode.DB_QUERY_INTERPRETATION_ERROR,
          errorTitle: 'Data Validation Error',
          errorMessage: 'Invalid database input provided.',
        };

      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: AppErrorCode.DB_TRANSACTION_FAILED,
          errorTitle: 'Database Error',
          errorMessage: 'A database error occurred. Please try again later.',
        };
    }
  }
}
