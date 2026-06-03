import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { RealtimeEmitterService } from './realtime-emitter.service';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [AuthModule, UserModule],
  providers: [RealtimeEmitterService, RealtimeGateway],
  exports: [RealtimeEmitterService],
})
export class RealtimeModule {}
