import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../appointment/schemas/appointment.schema';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertClinicAccess,
  isPlatformAdmin,
} from '../common/tenant/clinic-tenant.util';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  buildMongoSort,
  buildPaginatedResult,
  escapeRegex,
  parsePagination,
} from '../common/utils/pagination.util';
import { toObjectId } from '../common/utils/mongo.util';
import {
  PaymentRequest,
  PaymentRequestDocument,
  SubscriptionPlan,
} from '../payment/schemas/payment-request.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../payment/schemas/subscription.schema';
import { SubscriptionService } from '../payment/subscription.service';
import { Patient, PatientDocument } from '../patient/schemas/patient.schema';
import {
  QueueCounter,
  QueueCounterDocument,
} from '../queue/schemas/queue-counter.schema';
import { Queue, QueueDocument } from '../queue/schemas/queue.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { ListClinicsQueryDto } from './dto/list-clinics-query.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { Clinic, ClinicDocument } from './schemas/clinic.schema';

@Injectable()
export class ClinicService {
  constructor(
    @InjectModel(Clinic.name) private readonly clinicModel: Model<ClinicDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Queue.name) private readonly queueModel: Model<QueueDocument>,
    @InjectModel(QueueCounter.name)
    private readonly queueCounterModel: Model<QueueCounterDocument>,
    @InjectModel(PaymentRequest.name)
    private readonly paymentRequestModel: Model<PaymentRequestDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async create(createClinicDto: CreateClinicDto) {
    const clinic = await this.clinicModel.create(createClinicDto);
    await this.subscriptionService.activateOrExtend(
      clinic._id.toString(),
      SubscriptionPlan.STARTER,
    );
    return clinic;
  }

  /** Platform operator only — lists every clinic tenant. */
  async findAllForPlatform(
    query: ListClinicsQueryDto,
  ): Promise<PaginatedResult<ClinicDocument>> {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.search?.trim()) {
      const escaped = escapeRegex(query.search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { location: { $regex: escaped, $options: 'i' } },
      ];
    }
    const sort = buildMongoSort(
      query.sortBy,
      query.sortOrder,
      { name: 'name', location: 'location', createdAt: 'createdAt' },
      'name',
    );
    const [items, total] = await Promise.all([
      this.clinicModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.clinicModel.countDocuments(filter).exec(),
    ]);
    return buildPaginatedResult(items, total, page, limit);
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
    const payload = { ...updateClinicDto };
    if (!isPlatformAdmin(user)) {
      delete payload.isActive;
    }
    const clinic = await this.clinicModel
      .findOneAndUpdate({ _id: toObjectId(id) }, payload, { new: true })
      .exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }
    return clinic;
  }

  async removeScoped(id: string, user: AuthenticatedUser) {
    if (!isPlatformAdmin(user)) {
      throw new ForbiddenException(
        'Only platform administrators can deactivate clinics',
      );
    }
    const clinic = await this.clinicModel
      .findByIdAndUpdate(
        toObjectId(id),
        { isActive: false },
        { new: true },
      )
      .exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }
    return clinic;
  }

  async removePermanent(id: string, user: AuthenticatedUser) {
    if (!isPlatformAdmin(user)) {
      throw new ForbiddenException(
        'Only platform administrators can delete clinics',
      );
    }

    const clinicObjectId = toObjectId(id);
    const clinic = await this.clinicModel.findById(clinicObjectId).exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }

    if (clinic.isActive !== false) {
      throw new BadRequestException(
        'Deactivate the clinic before permanent deletion',
      );
    }

    const clinicFilter = { clinicId: clinicObjectId };

    await Promise.all([
      this.userModel.deleteMany(clinicFilter).exec(),
      this.patientModel.deleteMany(clinicFilter).exec(),
      this.appointmentModel.deleteMany(clinicFilter).exec(),
      this.queueModel.deleteMany(clinicFilter).exec(),
      this.queueCounterModel.deleteMany(clinicFilter).exec(),
      this.paymentRequestModel.deleteMany(clinicFilter).exec(),
      this.subscriptionModel.deleteMany(clinicFilter).exec(),
    ]);

    await this.clinicModel.findByIdAndDelete(clinicObjectId).exec();

    return { deleted: true, id };
  }

  async getDisplayName(clinicId: string): Promise<string> {
    const clinic = await this.clinicModel
      .findById(toObjectId(clinicId))
      .select('name')
      .lean()
      .exec();
    return clinic?.name ?? 'Clinic';
  }

  async getTimezone(clinicId: string): Promise<string> {
    const clinic = await this.clinicModel
      .findById(toObjectId(clinicId))
      .select('timezone')
      .lean()
      .exec();
    return clinic?.timezone?.trim() || 'Africa/Addis_Ababa';
  }

  private async findOneById(id: string) {
    const clinic = await this.clinicModel.findById(toObjectId(id)).exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${id} not found`);
    }
    return clinic;
  }
}
