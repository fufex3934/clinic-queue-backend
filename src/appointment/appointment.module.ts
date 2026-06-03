import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Clinic, ClinicSchema } from '../clinic/schemas/clinic.schema';
import { PatientModule } from '../patient/patient.module';
import { QueueModule } from '../queue/queue.module';
import { PaymentModule } from '../payment/payment.module';
import { RealtimeModule } from '../realtime/realtime.module';
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
    PaymentModule,
    RealtimeModule,
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Clinic.name, schema: ClinicSchema },
    ]),
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService, MongooseModule],
})
export class AppointmentModule {}
