import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

export type RealtimeEvent =
  | 'queue.updated'
  | 'queue.added'
  | 'queue.served'
  | 'appointment.updated';

@Injectable()
export class RealtimeEmitterService {
  private readonly logger = new Logger(RealtimeEmitterService.name);
  private server: Server | null = null;

  attachServer(server: Server): void {
    this.server = server;
  }

  emitToClinic(
    clinicId: string,
    event: RealtimeEvent,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) {
      return;
    }
    const room = `clinic:${clinicId}`;
    this.server.to(room).emit(event, { clinicId, ...payload });
    this.logger.debug(`Emitted ${event} to ${room}`);
  }
}
