import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clinic, ClinicSchema } from '../../clinic/schemas/clinic.schema';
import { User, UserSchema } from '../../user/schemas/user.schema';
import { MongoReplicaCheckService } from '../database/mongo-replica-check.service';
import { PlatformAdminBootstrapService } from './platform-admin-bootstrap.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Clinic.name, schema: ClinicSchema },
    ]),
  ],
  providers: [MongoReplicaCheckService, PlatformAdminBootstrapService],
})
export class BootstrapModule {}
