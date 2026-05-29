import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertClinicAccess,
  isPlatformAdmin,
} from '../common/tenant/clinic-tenant.util';
import { toObjectId } from '../common/utils/mongo.util';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { Clinic, ClinicDocument } from './schemas/clinic.schema';

@Injectable()
export class ClinicService {
  constructor(
    @InjectModel(Clinic.name) private readonly clinicModel: Model<ClinicDocument>,
  ) {}

  create(createClinicDto: CreateClinicDto) {
    return this.clinicModel.create(createClinicDto);
  }

  /** Platform operator only — lists every clinic tenant. */
  findAllForPlatform() {
    return this.clinicModel.find().sort({ name: 1 }).exec();
  }

  getMyClinic(clinicId: string) {
    return this.findOneById(clinicId);
  }

  async findOneScoped(id: string, user: AuthenticatedUser) {
    assertClinicAccess(user, id);
    return this.findOneById(id);
  }

  async updateScoped(
    id: string,
    updateClinicDto: UpdateClinicDto,
    user: AuthenticatedUser,
  ) {
    assertClinicAccess(user, id);
    const clinic = await this.clinicModel
      .findOneAndUpdate(
        { _id: toObjectId(id) },
        updateClinicDto,
        { new: true },
      )
      .exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }
    return clinic;
  }

  async removeScoped(id: string, user: AuthenticatedUser) {
    if (!isPlatformAdmin(user)) {
      throw new ForbiddenException('Only platform administrators can delete clinics');
    }
    const clinic = await this.clinicModel
      .findByIdAndDelete(toObjectId(id))
      .exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }
    return clinic;
  }

  private async findOneById(id: string) {
    const clinic = await this.clinicModel.findById(toObjectId(id)).exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }
    return clinic;
  }
}
