import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger('ErrorInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        // Log the error with context
        this.logger.error(
          `Error in ${context.getClass().name}.${context.getHandler().name}: ${error.message}`,
          error.stack,
        );

        // Handle different types of errors
        if (error instanceof HttpException) {
          return throwError(() => error);
        }

        // Handle Prisma errors
        if (error.code && error.code.startsWith('P')) {
          const prismaError = this.handlePrismaError(error);
          return throwError(() => prismaError);
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
          return throwError(() => 
            new HttpException(
              'Validation failed',
              HttpStatus.BAD_REQUEST,
            ),
          );
        }

        // Handle rate limiting errors
        if (error.message?.includes('rate limit')) {
          return throwError(() => 
            new HttpException(
              'Too many requests',
              HttpStatus.TOO_MANY_REQUESTS,
            ),
          );
        }

        // Default to internal server error
        return throwError(() => 
          new HttpException(
            'Internal server error',
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        );
      }),
    );
  }

  private handlePrismaError(error: any): HttpException {
    switch (error.code) {
      case 'P2002':
        return new HttpException(
          'A record with this information already exists',
          HttpStatus.CONFLICT,
        );
      case 'P2025':
        return new HttpException(
          'Record not found',
          HttpStatus.NOT_FOUND,
        );
      case 'P2003':
        return new HttpException(
          'Foreign key constraint failed',
          HttpStatus.BAD_REQUEST,
        );
      case 'P2014':
        return new HttpException(
          'Invalid ID provided',
          HttpStatus.BAD_REQUEST,
        );
      default:
        return new HttpException(
          'Database operation failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }
}
