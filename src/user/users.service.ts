import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { RegisterDto } from '../auth/dto/register.dto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BCRYPT_ROUNDS } from '../common/constants/security.constants';
import {
  assertClinicAccess,
  isPlatformAdmin,
} from '../common/tenant/clinic-tenant.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserPublic } from './interfaces/user-public.interface';
import { UserRole } from './schemas/user.schema';
import { UserService } from './user.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  async list(
    requestingUser: AuthenticatedUser,
    clinicId?: string,
  ): Promise<UserPublic[]> {
    const targetClinicId = this.resolveClinicId(requestingUser, clinicId);
    assertClinicAccess(requestingUser, targetClinicId);

    const users = await this.userService.findByClinicId(targetClinicId);
    return users.map((u) => this.userService.toPublic(u));
  }

  async create(
    requestingUser: AuthenticatedUser,
    dto: CreateUserDto,
  ): Promise<UserPublic> {
    const registerDto: RegisterDto = {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      role: dto.role,
      clinicId: dto.clinicId,
    };

    const { user } = await this.authService.register(
      registerDto,
      requestingUser,
    );
    const created = await this.userService.findById(user.id);
    if (!created) {
      throw new NotFoundException('User was created but could not be loaded');
    }
    return this.userService.toPublic(created);
  }

  async update(
    requestingUser: AuthenticatedUser,
    userId: string,
    dto: UpdateUserDto,
  ): Promise<UserPublic> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const targetClinicId = user.clinicId.toString();
    assertClinicAccess(requestingUser, targetClinicId);

    if (!isPlatformAdmin(requestingUser)) {
      if (user.role === UserRole.PLATFORM_ADMIN) {
        throw new ForbiddenException(
          'Only platform administrators can modify platform administrator accounts',
        );
      }
      if (dto.role === UserRole.PLATFORM_ADMIN) {
        throw new ForbiddenException(
          'Only platform administrators can assign the platform administrator role',
        );
      }
      if (
        dto.role &&
        dto.role !== UserRole.ADMIN &&
        dto.role !== UserRole.RECEPTIONIST
      ) {
        throw new ForbiddenException('Invalid role for clinic staff');
      }
    }

    if (userId === requestingUser.id && dto.role && dto.role !== user.role) {
      throw new ForbiddenException('You cannot change your own role');
    }

    if (dto.email && dto.email.toLowerCase() !== user.email?.toLowerCase()) {
      const existing = await this.userService.findByEmail(dto.email);
      if (existing && existing._id.toString() !== userId) {
        throw new ConflictException('Email is already registered');
      }
      user.email = dto.email.toLowerCase();
    }

    if (dto.phone && dto.phone !== user.phone) {
      const existing = await this.userService.findByPhone(dto.phone);
      if (existing && existing._id.toString() !== userId) {
        throw new ConflictException('Phone is already registered');
      }
      user.phone = dto.phone;
    }

    if (dto.name) {
      user.name = dto.name;
    }

    if (dto.role) {
      user.role = dto.role;
    }

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    if (!user.email?.trim() && !user.phone?.trim()) {
      throw new BadRequestException('User must have email or phone');
    }

    await user.save();
    return this.userService.toPublic(user);
  }

  private resolveClinicId(
    requestingUser: AuthenticatedUser,
    clinicId?: string,
  ): string {
    if (clinicId) {
      if (!isPlatformAdmin(requestingUser) && clinicId !== requestingUser.clinicId) {
        throw new ForbiddenException(
          'Clinic administrators can only list users for their own clinic',
        );
      }
      return clinicId;
    }

    return requestingUser.clinicId;
  }
}
