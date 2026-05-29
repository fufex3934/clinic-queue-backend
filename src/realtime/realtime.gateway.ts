import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RealtimeEmitterService } from './realtime-emitter.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(): void {
    this.realtimeEmitter.attachServer(this.server);
    this.logger.log('Realtime gateway initialized');
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      const clinicId =
        (client.handshake.query?.clinicId as string | undefined) ??
        payload.clinicId;

      await client.join(`clinic:${clinicId}`);
      client.data.clinicId = clinicId;
      client.data.userId = payload.sub;
    } catch {
      client.disconnect(true);
    }
  }
}
