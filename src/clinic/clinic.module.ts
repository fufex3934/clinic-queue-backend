import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Appointment,
  AppointmentSchema,
} from '../appointment/schemas/appointment.schema';
import { AuthModule } from '../auth/auth.module';
import {
  PaymentRequest,
  PaymentRequestSchema,
} from '../payment/schemas/payment-request.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../payment/schemas/subscription.schema';
import { PaymentModule } from '../payment/payment.module';
import {
  Patient,
  PatientSchema,
} from '../patient/schemas/patient.schema';
import {
  QueueCounter,
  QueueCounterSchema,
} from '../queue/schemas/queue-counter.schema';
import { Queue, QueueSchema } from '../queue/schemas/queue.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';
import { Clinic, ClinicSchema } from './schemas/clinic.schema';

@Module({
  imports: [
    AuthModule,
    PaymentModule,
    MongooseModule.forFeature([
      { name: Clinic.name, schema: ClinicSchema },
      { name: User.name, schema: UserSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Queue.name, schema: QueueSchema },
      { name: QueueCounter.name, schema: QueueCounterSchema },
      { name: PaymentRequest.name, schema: PaymentRequestSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [ClinicController],
  providers: [ClinicService],
  exports: [ClinicService, MongooseModule],
})
export class ClinicModule {}
