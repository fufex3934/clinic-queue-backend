import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Clinic, ClinicDocument } from '../clinic/schemas/clinic.schema';
import { BCRYPT_ROUNDS } from '../common/constants/security.constants';
import { isPlatformAdmin } from '../common/tenant/clinic-tenant.util';
import { toObjectId } from '../common/utils/mongo.util';
import { UserDocument, UserRole } from '../user/schemas/user.schema';
import { UserService } from '../user/user.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthResponse,
  AuthUserResponse,
} from './interfaces/auth-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @InjectModel(Clinic.name)
    private readonly clinicModel: Model<ClinicDocument>,
  ) {}

  async register(
    registerDto: RegisterDto,
    requestingUser: AuthenticatedUser,
  ): Promise<AuthResponse> {
    if (!registerDto.email?.trim() && !registerDto.phone?.trim()) {
      throw new BadRequestException('Either email or phone must be provided');
    }

    const targetClinicId = this.resolveRegisterClinicId(
      registerDto,
      requestingUser,
    );
    const targetRole = this.resolveRegisterRole(registerDto, requestingUser);

    const clinicExists = await this.clinicModel.exists({
      _id: toObjectId(targetClinicId),
    });
    if (!clinicExists) {
      throw new ConflictException(`Clinic ${targetClinicId} not found`);
    }

    if (registerDto.email) {
      const existingEmail = await this.userService.findByEmail(
        registerDto.email,
      );
      if (existingEmail) {
        throw new ConflictException('Email is already registered');
      }
    }

    if (registerDto.phone) {
      const existingPhone = await this.userService.findByPhone(
        registerDto.phone,
      );
      if (existingPhone) {
        throw new ConflictException('Phone is already registered');
      }
    }

    const passwordHash = await bcrypt.hash(registerDto.password, BCRYPT_ROUNDS);

    const user = await this.userService.create({
      name: registerDto.name,
      email: registerDto.email?.toLowerCase(),
      phone: registerDto.phone,
      passwordHash,
      role: targetRole,
      clinicId: targetClinicId,
    });

    return this.buildAuthResponse(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const identifier = loginDto.identifier.trim();
    const user = await this.findUserWithPassword(identifier);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  getProfile(user: {
    id: string;
    name: string;
    role: UserDocument['role'];
    clinicId: string;
  }): AuthUserResponse {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      clinicId: user.clinicId,
    };
  }

  private resolveRegisterClinicId(
    registerDto: RegisterDto,
    requestingUser: AuthenticatedUser,
  ): string {
    if (isPlatformAdmin(requestingUser)) {
      return registerDto.clinicId;
    }

    if (requestingUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can register staff');
    }

    if (registerDto.clinicId !== requestingUser.clinicId) {
      throw new ForbiddenException(
        'Clinic administrators can only register users for their own clinic',
      );
    }

    return requestingUser.clinicId;
  }

  private resolveRegisterRole(
    registerDto: RegisterDto,
    requestingUser: AuthenticatedUser,
  ): UserRole {
    if (isPlatformAdmin(requestingUser)) {
      if (registerDto.role === UserRole.PLATFORM_ADMIN) {
        return UserRole.PLATFORM_ADMIN;
      }
      return registerDto.role;
    }

    if (registerDto.role === UserRole.PLATFORM_ADMIN) {
      throw new ForbiddenException(
        'Only platform administrators can create platform administrator accounts',
      );
    }

    if (
      registerDto.role !== UserRole.ADMIN &&
      registerDto.role !== UserRole.RECEPTIONIST
    ) {
      throw new ForbiddenException('Invalid role for clinic registration');
    }

    return registerDto.role;
  }

  private async findUserWithPassword(identifier: string) {
    if (identifier.includes('@')) {
      return this.userService.findByEmailWithPassword(identifier);
    }
    return this.userService.findByPhoneWithPassword(identifier);
  }

  private buildAuthResponse(user: UserDocument): AuthResponse {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      role: user.role,
      clinicId: user.clinicId.toString(),
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: UserDocument): AuthUserResponse {
    return {
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      clinicId: user.clinicId.toString(),
    };
  }
}
