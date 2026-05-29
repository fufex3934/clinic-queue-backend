import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Clinic, ClinicDocument } from '../clinic/schemas/clinic.schema';
import { BCRYPT_ROUNDS } from '../common/constants/security.constants';
import { isPlatformAdmin } from '../common/tenant/clinic-tenant.util';
import { toObjectId } from '../common/utils/mongo.util';
import { UserDocument, UserRole } from '../user/schemas/user.schema';
import { UserService } from '../user/user.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from './schemas/password-reset-token.schema';
import {
  AuthResponse,
  AuthUserResponse,
} from './interfaces/auth-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @InjectModel(Clinic.name)
    private readonly clinicModel: Model<ClinicDocument>,
    @InjectModel(PasswordResetToken.name)
    private readonly resetTokenModel: Model<PasswordResetTokenDocument>,
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

    if (user.isActive === false) {
      throw new UnauthorizedException('Account is disabled');
    }

    if (user.role !== UserRole.PLATFORM_ADMIN) {
      const clinic = await this.clinicModel.findById(user.clinicId).exec();
      if (!clinic || clinic.isActive === false) {
        throw new UnauthorizedException('Clinic is deactivated');
      }
    }

    return this.buildAuthResponse(user);
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; resetToken?: string }> {
    const message =
      'If an account exists for this identifier, password reset instructions have been sent.';

    const user = await this.findUserWithPassword(dto.identifier.trim());
    if (!user) {
      return { message };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.resetTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      usedAt: null,
    });

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `Password reset token for ${dto.identifier}: ${rawToken}`,
      );
      return { message, resetToken: rawToken };
    }

    return { message };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.resetTokenModel
      .findOne({
        tokenHash,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (!record) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.userService.findById(record.userId.toString());
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await user.save();

    record.usedAt = new Date();
    await record.save();

    return { message: 'Password has been reset. You can sign in now.' };
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
