import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { Patient, PatientSchema } from './schemas/patient.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Patient.name, schema: PatientSchema }]),
  ],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService, MongooseModule],
})
export class PatientModule {}
