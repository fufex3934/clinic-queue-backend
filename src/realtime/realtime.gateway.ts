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
import {
  assertClinicAccess,
  isPlatformAdmin,
} from '../common/tenant/clinic-tenant.util';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserService } from '../user/user.service';
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
    private readonly userService: UserService,
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
      const user = await this.userService.findById(payload.sub);
      if (!user || user.isActive === false) {
        client.disconnect(true);
        return;
      }

      const authUser = {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
        clinicId: user.clinicId.toString(),
      };

      const requestedClinicId = (
        client.handshake.query?.clinicId as string | undefined
      )?.trim();

      if (isPlatformAdmin(authUser)) {
        await client.join('platform');
        client.data.isPlatform = true;
        client.data.userId = authUser.id;
        if (requestedClinicId) {
          await client.join(`clinic:${requestedClinicId}`);
          client.data.clinicId = requestedClinicId;
        }
        return;
      }

      const clinicId = authUser.clinicId;
      if (requestedClinicId && requestedClinicId !== clinicId) {
        this.logger.warn(
          `WebSocket rejected cross-clinic join for user ${authUser.id}`,
        );
        client.disconnect(true);
        return;
      }
      assertClinicAccess(authUser, clinicId);

      await client.join(`clinic:${clinicId}`);
      client.data.clinicId = clinicId;
      client.data.userId = authUser.id;
    } catch {
      client.disconnect(true);
    }
  }
}
