import { Injectable, Logger } from '@nestjs/common';

export interface StructuredLogPayload {
  timestamp: string;
  action: string;
  userId?: string;
  clinicId?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class StructuredLoggerService {
  private readonly logger = new Logger('ClinicSaaS');

  write(payload: Omit<StructuredLogPayload, 'timestamp'>): void {
    const entry: StructuredLogPayload = {
      timestamp: new Date().toISOString(),
      ...payload,
    };
    this.logger.log(JSON.stringify(entry));
  }

  logRequest(payload: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    userId?: string;
    clinicId?: string;
  }): void {
    this.write({
      action: 'http.request',
      userId: payload.userId,
      clinicId: payload.clinicId,
      meta: {
        method: payload.method,
        path: payload.path,
        statusCode: payload.statusCode,
        durationMs: payload.durationMs,
      },
    });
  }

  logError(payload: {
    action: string;
    message: string;
    userId?: string;
    clinicId?: string;
    meta?: Record<string, unknown>;
  }): void {
    this.write({
      action: payload.action,
      userId: payload.userId,
      clinicId: payload.clinicId,
      meta: { message: payload.message, ...payload.meta },
    });
  }

  logQueue(payload: {
    action: 'queue.add' | 'queue.serve-next' | 'queue.get-today';
    userId?: string;
    clinicId?: string;
    meta?: Record<string, unknown>;
  }): void {
    this.write({
      action: payload.action,
      userId: payload.userId,
      clinicId: payload.clinicId,
      meta: payload.meta,
    });
  }
}
