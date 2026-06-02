import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { PatientModule } from '../patient/patient.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import {
  QueueCounter,
  QueueCounterSchema,
} from './schemas/queue-counter.schema';
import { Queue, QueueSchema } from './schemas/queue.schema';

@Module({
  imports: [
    AuthModule,
    PatientModule,
    RealtimeModule,
    MongooseModule.forFeature([
      { name: Queue.name, schema: QueueSchema },
      { name: QueueCounter.name, schema: QueueCounterSchema },
    ]),
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService, MongooseModule],
})
export class QueueModule {}
