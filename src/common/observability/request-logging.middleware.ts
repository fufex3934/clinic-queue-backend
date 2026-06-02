import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { StructuredLoggerService } from './structured-logger.service';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly structuredLogger: StructuredLoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const started = Date.now();

    res.on('finish', () => {
      const user = req.user as AuthenticatedUser | undefined;
      this.structuredLogger.logRequest({
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        userId: user?.id,
        clinicId: user?.clinicId,
      });
    });

    next();
  }
}
