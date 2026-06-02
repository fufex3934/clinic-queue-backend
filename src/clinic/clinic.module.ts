import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';
import { Clinic, ClinicSchema } from './schemas/clinic.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Clinic.name, schema: ClinicSchema }]),
  ],
  controllers: [ClinicController],
  providers: [ClinicService],
  exports: [ClinicService, MongooseModule],
})
export class ClinicModule {}
