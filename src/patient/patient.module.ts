import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Appointment,
  AppointmentSchema,
} from '../appointment/schemas/appointment.schema';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { Queue, QueueSchema } from '../queue/schemas/queue.schema';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { Patient, PatientSchema } from './schemas/patient.schema';

@Module({
  imports: [
    AuthModule,
    PaymentModule,
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: Queue.name, schema: QueueSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService, MongooseModule],
})
export class PatientModule {}
