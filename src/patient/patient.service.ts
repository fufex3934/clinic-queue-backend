import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toObjectId } from '../common/utils/mongo.util';
import { CreatePatientDto } from './dto/create-patient.dto';
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

  async findAll(clinicId: string) {
    try {
      return await this.patientModel
        .find({ clinicId: toObjectId(clinicId) })
        .sort({ createdAt: -1 })
        .exec();
    } catch {
      throw new InternalServerErrorException('Failed to fetch patients');
    }
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
