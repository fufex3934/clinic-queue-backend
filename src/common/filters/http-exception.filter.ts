import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  error: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      const rawMessage =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);

      const message = Array.isArray(rawMessage)
        ? rawMessage.join(', ')
        : String(rawMessage);

      const payload: ApiErrorBody = {
        statusCode: status,
        message,
        error: HttpStatus[status] ?? 'Error',
      };

      response.status(status).json(payload);
      return;
    }

    const payload: ApiErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }
}
