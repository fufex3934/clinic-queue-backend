import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toObjectId } from '../common/utils/mongo.util';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Patient, PatientDocument } from './schemas/patient.schema';

@Injectable()
export class PatientService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
  ) {}

  async create(clinicId: string, createPatientDto: CreatePatientDto) {
    try {
      const patient = await this.patientModel.create({
        ...createPatientDto,
        clinicId: toObjectId(clinicId),
      });
      return patient;
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Patient with phone ${createPatientDto.phone} already exists in this clinic`,
        );
      }
      throw new InternalServerErrorException('Failed to create patient');
    }
  }

  async findAll(clinicId: string, search?: string) {
    try {
      const filter: Record<string, unknown> = {
        clinicId: toObjectId(clinicId),
      };
      if (search?.trim()) {
        const q = search.trim();
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { phone: { $regex: escaped, $options: 'i' } },
        ];
      }
      return await this.patientModel.find(filter).sort({ createdAt: -1 }).exec();
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

    const duplicate = await this.patientModel
      .findOne({
        clinicId: toObjectId(clinicId),
        phone: dto.phone,
        _id: { $ne: patient._id },
      })
      .exec();
    if (duplicate) {
      throw new ConflictException(
        `Patient with phone ${dto.phone} already exists in this clinic`,
      );
    }

    patient.name = dto.name;
    patient.phone = dto.phone;
    try {
      return await patient.save();
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          `Patient with phone ${dto.phone} already exists in this clinic`,
        );
      }
      throw new InternalServerErrorException('Failed to update patient');
    }
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
    return patient;
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

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
