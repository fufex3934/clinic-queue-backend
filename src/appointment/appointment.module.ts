import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { PatientModule } from '../patient/patient.module';
import { QueueModule } from '../queue/queue.module';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import {
  Appointment,
  AppointmentSchema,
} from './schemas/appointment.schema';

@Module({
  imports: [
    AuthModule,
    PatientModule,
    QueueModule,
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService, MongooseModule],
})
export class AppointmentModule {}
