import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toObjectId } from '../common/utils/mongo.util';
import { UserPublic } from './interfaces/user-public.interface';
import { User, UserDocument } from './schemas/user.schema';

export interface CreateUserData {
  name: string;
  email?: string;
  phone?: string;
  passwordHash: string;
  role: User['role'];
  clinicId: string;
}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  create(data: CreateUserData) {
    return this.userModel.create(data);
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findByPhone(phone: string) {
    return this.userModel.findOne({ phone }).exec();
  }

  findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  findByPhoneWithPassword(phone: string) {
    return this.userModel.findOne({ phone }).select('+passwordHash').exec();
  }

  findByIdWithPassword(id: string) {
    return this.userModel.findById(id).select('+passwordHash').exec();
  }

  findByClinicId(clinicId: string) {
    return this.userModel
      .find({ clinicId: toObjectId(clinicId) })
      .sort({ name: 1 })
      .exec();
  }

  toPublic(user: UserDocument): UserPublic {
    const doc = user as UserDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      clinicId: user.clinicId.toString(),
      createdAt: doc.createdAt?.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    };
  }
}
