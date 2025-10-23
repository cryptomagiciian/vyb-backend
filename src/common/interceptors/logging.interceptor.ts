import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, ip } = request;
    const userAgent = request.get('User-Agent') || '';
    const startTime = Date.now();

    // Generate request ID for tracing
    const requestId = request.headers['x-request-id'] as string || 
                     Math.random().toString(36).substring(2, 15);

    // Add request ID to response headers
    response.setHeader('X-Request-ID', requestId);

    // Log request
    this.logger.log(
      `Incoming ${method} ${url} - ${ip} - ${userAgent} - ${requestId}`,
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const { statusCode } = response;
          
          this.logger.log(
            `Outgoing ${method} ${url} - ${statusCode} - ${duration}ms - ${requestId}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          
          this.logger.error(
            `Error ${method} ${url} - ${statusCode} - ${duration}ms - ${requestId} - ${error.message}`,
          );
        },
      }),
    );
  }
}
