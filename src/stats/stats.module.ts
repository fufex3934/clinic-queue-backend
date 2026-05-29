import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  Appointment,
  AppointmentSchema,
} from '../appointment/schemas/appointment.schema';
import { Clinic, ClinicSchema } from '../clinic/schemas/clinic.schema';
import { Patient, PatientSchema } from '../patient/schemas/patient.schema';
import { Queue, QueueSchema } from '../queue/schemas/queue.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: Queue.name, schema: QueueSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Clinic.name, schema: ClinicSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
