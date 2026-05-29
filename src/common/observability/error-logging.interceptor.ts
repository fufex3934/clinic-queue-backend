import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { StructuredLoggerService } from './structured-logger.service';

@Injectable()
export class ErrorLoggingInterceptor implements NestInterceptor {
  constructor(private readonly structuredLogger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    return next.handle().pipe(
      catchError((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error';

        this.structuredLogger.logError({
          action: 'http.error',
          message,
          userId: user?.id,
          clinicId: user?.clinicId,
          meta: {
            handler: context.getHandler().name,
            class: context.getClass().name,
          },
        });

        return throwError(() => error);
      }),
    );
  }
}
