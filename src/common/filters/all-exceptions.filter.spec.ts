import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppErrorCode } from '../constants/error-codes';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = {
      method: 'GET',
      url: '/test-url',
      headers: { 'x-correlation-id': 'test-corr-id' },
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  it('should mask internal JS error messages and never leak stack traces', () => {
    const error = new Error('Sensitive database column "user.password_hash" failed');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const sentPayload = mockResponse.json.mock.calls[0][0];

    expect(sentPayload.success).toBe(false);
    expect(sentPayload.errorCode).toBe(AppErrorCode.INTERNAL_SERVER_ERROR);
    expect(sentPayload.message).toBe('An unexpected error occurred. Please try again later.');
    expect(sentPayload.correlationId).toBe('test-corr-id');
    expect(sentPayload.details).toBeUndefined();
    expect(JSON.stringify(sentPayload)).not.toContain('password_hash');
  });

  it('should sanitize Prisma P2002 unique constraint errors for email field', () => {
    const prismaError = {
      code: 'P2002',
      meta: { target: ['email'] },
      message: 'Unique constraint failed on the fields: (`email`)',
    };

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const sentPayload = mockResponse.json.mock.calls[0][0];

    expect(sentPayload.errorCode).toBe(AppErrorCode.EMAIL_ALREADY_EXISTS);
    expect(sentPayload.message).toBe('An account with this email already exists. Please use a different email address.');
    expect(sentPayload.details).toBeUndefined();
    expect(JSON.stringify(sentPayload)).not.toContain('(`email`)');
  });

  it('should sanitize generic Prisma database failures without leaking query statements', () => {
    const prismaQueryError = {
      code: 'P2010',
      message: 'Raw query failed. Code: 42P01. Message: relation "secret_schema.merchants" does not exist',
    };

    filter.catch(prismaQueryError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const sentPayload = mockResponse.json.mock.calls[0][0];

    expect(sentPayload.errorCode).toBe(AppErrorCode.DB_TRANSACTION_FAILED);
    expect(sentPayload.message).toBe('A database error occurred. Please try again later.');
    expect(sentPayload.details).toBeUndefined();
    expect(JSON.stringify(sentPayload)).not.toContain('secret_schema');
  });

  it('should preserve standard safe 4xx HttpException messages', () => {
    const httpError = new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);

    filter.catch(httpError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    const sentPayload = mockResponse.json.mock.calls[0][0];

    expect(sentPayload.errorCode).toBe(AppErrorCode.UNAUTHORIZED);
    expect(sentPayload.message).toBe('Invalid email or password');
  });
});
