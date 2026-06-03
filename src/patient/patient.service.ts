import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../appointment/schemas/appointment.schema';
import { ageYearsFromDateOfBirth } from '../common/utils/patient-age.util';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  buildMongoSort,
  buildPaginatedResult,
  escapeRegex,
  parsePagination,
} from '../common/utils/pagination.util';
import { toObjectId } from '../common/utils/mongo.util';
import { Queue, QueueDocument } from '../queue/schemas/queue.schema';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Patient, PatientDocument } from './schemas/patient.schema';

export type PatientResponse = {
  _id: string;
  clinicId: string;
  name: string;
  phone: string;
  dateOfBirth: string | null;
  ageYears: number | null;
  gender: string | null;
  secondaryPhone: string | null;
  notes: string | null;
  createdAt?: Date;
  lastVisitAt: string | null;
};

@Injectable()
export class PatientService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Queue.name)
    private readonly queueModel: Model<QueueDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
  ) {}

  async create(clinicId: string, dto: CreatePatientDto) {
    await this.assertNamePhoneAvailable(clinicId, dto.name, dto.phone);
    const patient = await this.patientModel.create({
      clinicId: toObjectId(clinicId),
      name: dto.name,
      phone: dto.phone,
      ...this.profileFromDto(dto),
    });
    return this.toResponse(patient);
  }

  async findAll(
    clinicId: string,
    query: ListPatientsQueryDto,
  ): Promise<PaginatedResult<PatientResponse>> {
    try {
      const { page, limit, skip } = parsePagination(query);
      const filter: Record<string, unknown> = {
        clinicId: toObjectId(clinicId),
      };
      if (query.search?.trim()) {
        const escaped = escapeRegex(query.search.trim());
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { phone: { $regex: escaped, $options: 'i' } },
          { secondaryPhone: { $regex: escaped, $options: 'i' } },
          { notes: { $regex: escaped, $options: 'i' } },
        ];
      }
      const sort = buildMongoSort(
        query.sortBy,
        query.sortOrder,
        { name: 'name', phone: 'phone', createdAt: 'createdAt' },
        'createdAt',
      );
      const [items, total] = await Promise.all([
        this.patientModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
        this.patientModel.countDocuments(filter).exec(),
      ]);
      return buildPaginatedResult(
        items.map((p) => this.toResponse(p)),
        total,
        page,
        limit,
      );
    } catch {
      throw new InternalServerErrorException('Failed to fetch patients');
    }
  }

  async update(clinicId: string, patientId: string, dto: UpdatePatientDto) {
    const patient = await this.patientModel
      .findOne({
        _id: toObjectId(patientId),
        clinicId: toObjectId(clinicId),
      })
      .exec();
    if (!patient) {
      throw new NotFoundException(`Patient ${patientId} not found`);
    }

    await this.assertNamePhoneAvailable(
      clinicId,
      dto.name,
      dto.phone,
      patient._id,
    );

    patient.name = dto.name;
    patient.phone = dto.phone;
    Object.assign(patient, this.profileFromDto(dto));
    const saved = await patient.save();
    return this.toResponse(saved);
  }

  async findOne(clinicId: string, patientId: string) {
    const patient = await this.patientModel
      .findOne({
        _id: toObjectId(patientId),
        clinicId: toObjectId(clinicId),
      })
      .exec();
    if (!patient) {
      throw new NotFoundException(`Patient ${patientId} not found`);
    }
    const lastVisitAt = await this.resolveLastVisitAt(clinicId, patientId);
    return this.toResponse(patient, lastVisitAt);
  }

  async existsInClinic(patientId: string, clinicId: string): Promise<boolean> {
    const found = await this.patientModel
      .exists({
        _id: toObjectId(patientId),
        clinicId: toObjectId(clinicId),
      })
      .exec();
    return !!found;
  }

  private profileFromDto(dto: CreatePatientDto | UpdatePatientDto) {
    return {
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender,
      secondaryPhone: dto.secondaryPhone,
      notes: dto.notes,
    };
  }

  private async assertNamePhoneAvailable(
    clinicId: string,
    name: string,
    phone: string,
    excludeId?: Types.ObjectId,
  ) {
    const filter: Record<string, unknown> = {
      clinicId: toObjectId(clinicId),
      phone: phone.trim(),
      name: { $regex: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') },
    };
    if (excludeId) {
      filter._id = { $ne: excludeId };
    }
    const duplicate = await this.patientModel.findOne(filter).exec();
    if (duplicate) {
      throw new ConflictException(
        `A patient named "${name.trim()}" with this phone already exists in this clinic`,
      );
    }
  }

  private async resolveLastVisitAt(
    clinicId: string,
    patientId: string,
  ): Promise<Date | null> {
    const clinicObjectId = toObjectId(clinicId);
    const patientObjectId = toObjectId(patientId);
    const [latestQueue, latestAppointment] = await Promise.all([
      this.queueModel
        .findOne({ clinicId: clinicObjectId, patientId: patientObjectId })
        .sort({ date: -1 })
        .select('date')
        .lean()
        .exec(),
      this.appointmentModel
        .findOne({ clinicId: clinicObjectId, patientId: patientObjectId })
        .sort({ date: -1 })
        .select('date')
        .lean()
        .exec(),
    ]);
    const dates: Date[] = [];
    if (latestQueue?.date) dates.push(new Date(latestQueue.date));
    if (latestAppointment?.date) dates.push(new Date(latestAppointment.date));
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }

  private toResponse(
    patient: PatientDocument,
    lastVisitAt?: Date | null,
  ): PatientResponse {
    const dob = patient.dateOfBirth;
    return {
      _id: patient._id.toString(),
      clinicId: patient.clinicId.toString(),
      name: patient.name,
      phone: patient.phone,
      dateOfBirth: dob ? dob.toISOString().slice(0, 10) : null,
      ageYears: dob ? ageYearsFromDateOfBirth(dob) : null,
      gender: patient.gender ?? null,
      secondaryPhone: patient.secondaryPhone ?? null,
      notes: patient.notes ?? null,
      createdAt: (patient as PatientDocument & { createdAt?: Date }).createdAt,
      lastVisitAt: lastVisitAt ? lastVisitAt.toISOString() : null,
    };
  }
}
