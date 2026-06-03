import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  buildMongoSort,
  buildPaginatedResult,
  escapeRegex,
  parsePagination,
} from '../common/utils/pagination.util';
import { toObjectId } from '../common/utils/mongo.util';
import { ListPlatformUsersQueryDto } from './dto/list-platform-users-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UserPlatformRow } from './interfaces/user-platform.interface';
import { UserPublic } from './interfaces/user-public.interface';
import { User, UserDocument, UserRole } from './schemas/user.schema';

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

  /** Clinic staff only — platform operators are not tenant staff. */
  async findClinicStaffPaginated(
    clinicId: string,
    query: ListUsersQueryDto,
  ): Promise<PaginatedResult<UserDocument>> {
    const { page, limit, skip } = parsePagination(query);
    const filter: FilterQuery<UserDocument> = {
      clinicId: toObjectId(clinicId),
      role: { $ne: UserRole.PLATFORM_ADMIN },
    };
    if (query.search?.trim()) {
      const escaped = escapeRegex(query.search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
      ];
    }
    const sort = buildMongoSort(
      query.sortBy,
      query.sortOrder,
      { name: 'name', role: 'role', createdAt: 'createdAt' },
      'name',
    );
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('name email phone role clinicId isActive createdAt updatedAt')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    return buildPaginatedResult(
      items as unknown as UserDocument[],
      total,
      page,
      limit,
    );
  }

  async findAllForPlatformPaginated(
    query: ListPlatformUsersQueryDto,
  ): Promise<PaginatedResult<UserPlatformRow>> {
    const { page, limit, skip } = parsePagination(query);
    const filter: FilterQuery<UserDocument> = {};
    if (query.clinicId) {
      filter.clinicId = toObjectId(query.clinicId);
    }
    if (query.role) {
      filter.role = query.role;
    }
    if (query.isActive === true) {
      filter.isActive = { $ne: false };
    } else if (query.isActive === false) {
      filter.isActive = false;
    }
    if (query.search?.trim()) {
      const escaped = escapeRegex(query.search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
      ];
    }
    const sort = buildMongoSort(
      query.sortBy,
      query.sortOrder,
      { name: 'name', role: 'role', createdAt: 'createdAt' },
      'createdAt',
    );
    const [rows, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('name email phone role clinicId isActive createdAt updatedAt')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('clinicId', 'name location')
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    const items = rows.map((user) =>
      this.toPlatformRow(user as unknown as UserDocument),
    );
    return buildPaginatedResult(items, total, page, limit);
  }

  private toPlatformRow(user: UserDocument): UserPlatformRow {
    const base = this.toPublic(user);
    const clinic = user.clinicId as unknown as {
      name?: string;
      location?: string;
    };
    const clinicName =
      typeof clinic === 'object' && clinic?.name
        ? clinic.name
        : String(user.clinicId);
    const clinicLocation =
      typeof clinic === 'object' ? clinic?.location : undefined;

    return {
      ...base,
      clinicName,
      clinicLocation,
    };
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
      isActive: user.isActive !== false,
      createdAt: doc.createdAt?.toISOString(),
      updatedAt: doc.updatedAt?.toISOString(),
    };
  }
}
