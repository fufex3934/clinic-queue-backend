import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Clinic, ClinicDocument } from '../../clinic/schemas/clinic.schema';
import { BCRYPT_ROUNDS } from '../constants/security.constants';
import { User, UserDocument, UserRole } from '../../user/schemas/user.schema';

@Injectable()
export class PlatformAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformAdminBootstrapService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Clinic.name) private readonly clinicModel: Model<ClinicDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensurePlatformAdmin();
  }

  async ensurePlatformAdmin(): Promise<void> {
    const existing = await this.userModel
      .findOne({ role: UserRole.PLATFORM_ADMIN })
      .exec();

    if (existing) {
      this.logger.log('Platform administrator already exists — bootstrap skipped');
      return;
    }

    const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.PLATFORM_ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.log(
        'PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set — skipping platform admin bootstrap',
      );
      return;
    }

    if (password.length < 8) {
      this.logger.warn(
        'PLATFORM_ADMIN_PASSWORD must be at least 8 characters — platform admin not created',
      );
      return;
    }

    let clinic = await this.clinicModel.findOne().sort({ createdAt: 1 }).exec();
    if (!clinic) {
      clinic = await this.clinicModel.create({
        name: process.env.SEED_CLINIC_NAME?.trim() || 'Default Clinic',
        location: 'Platform bootstrap',
      });
      this.logger.log(`Created default clinic for platform admin: ${clinic.name}`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await this.userModel.create({
      name: 'Platform Administrator',
      email,
      passwordHash,
      role: UserRole.PLATFORM_ADMIN,
      clinicId: clinic._id,
    });

    this.logger.log(`Platform administrator created (${email})`);
  }
}
