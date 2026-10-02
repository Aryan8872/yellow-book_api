import {
  ValidationPipe,
  ValidationError,
  BadRequestException,
} from '@nestjs/common';
import { AppErrorCode } from '../constants/error-codes';
import { ValidationErrorDetail } from '../filters/all-exceptions.filter';

/**
 * Creates the enterprise validation pipe which recursively formats class-validator
 * constraints into clean, frontend/mobile ready field-by-field error objects.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (validationErrors: ValidationError[] = []) => {
      const formattedErrors: ValidationErrorDetail[] = [];

      const extractErrors = (
        errors: ValidationError[],
        parentProperty = '',
      ) => {
        for (const err of errors) {
          const propertyPath = parentProperty
            ? `${parentProperty}.${err.property}`
            : err.property;

          if (err.constraints) {
            formattedErrors.push({
              field: propertyPath,
              rejectedValue:
                typeof err.value === 'object' ? undefined : err.value,
              constraints: err.constraints,
            });
          }

          if (err.children && err.children.length > 0) {
            extractErrors(err.children, propertyPath);
          }
        }
      };

      extractErrors(validationErrors);

      const firstErrorMessage =
        formattedErrors.length > 0 &&
        formattedErrors[0].constraints &&
        Object.values(formattedErrors[0].constraints)[0]
          ? Object.values(formattedErrors[0].constraints)[0]
          : 'Validation failed';

      return new BadRequestException({
        statusCode: 400,
        error: 'Unprocessable Entity',
        errorCode: AppErrorCode.VALIDATION_FAILED,
        message: firstErrorMessage,
        details: formattedErrors,
      });
    },
  });
}
