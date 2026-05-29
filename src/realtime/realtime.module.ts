import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeEmitterService } from './realtime-emitter.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [RealtimeEmitterService, RealtimeGateway],
  exports: [RealtimeEmitterService],
})
export class RealtimeModule {}
