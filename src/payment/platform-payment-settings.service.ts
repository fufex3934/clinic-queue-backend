import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { toObjectId } from '../common/utils/mongo.util';
import { UpdatePlatformPaymentSettingsDto } from './dto/update-platform-payment-settings.dto';
import {
  PLATFORM_PAYMENT_SETTINGS_KEY,
  PlatformPaymentSettings,
  PlatformPaymentSettingsDocument,
} from './schemas/platform-payment-settings.schema';

export type PlatformPaymentConfigDto = {
  paymentQrImageUrl: string | null;
  paymentInstructions: string | null;
  updatedAt: string | null;
};

@Injectable()
export class PlatformPaymentSettingsService {
  constructor(
    @InjectModel(PlatformPaymentSettings.name)
    private readonly settingsModel: Model<PlatformPaymentSettingsDocument>,
  ) {}

  async getConfig(): Promise<PlatformPaymentConfigDto> {
    const doc = await this.findOrCreate();
    return this.toDto(doc);
  }

  async updateInstructions(
    dto: UpdatePlatformPaymentSettingsDto,
    user: AuthenticatedUser,
  ): Promise<PlatformPaymentConfigDto> {
    const doc = await this.settingsModel
      .findOneAndUpdate(
        { key: PLATFORM_PAYMENT_SETTINGS_KEY },
        {
          $set: {
            paymentInstructions: dto.paymentInstructions?.trim() ?? '',
            updatedBy: toObjectId(user.id),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return this.toDto(doc!);
  }

  async updateQrImageUrl(
    paymentQrImageUrl: string,
    user: AuthenticatedUser,
  ): Promise<PlatformPaymentConfigDto> {
    const doc = await this.settingsModel
      .findOneAndUpdate(
        { key: PLATFORM_PAYMENT_SETTINGS_KEY },
        {
          $set: {
            paymentQrImageUrl,
            updatedBy: toObjectId(user.id),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return this.toDto(doc!);
  }

  private async findOrCreate(): Promise<PlatformPaymentSettingsDocument> {
    let doc = await this.settingsModel
      .findOne({ key: PLATFORM_PAYMENT_SETTINGS_KEY })
      .exec();
    if (!doc) {
      [doc] = await this.settingsModel.create([
        { key: PLATFORM_PAYMENT_SETTINGS_KEY },
      ]);
    }
    return doc;
  }

  private toDto(doc: PlatformPaymentSettingsDocument): PlatformPaymentConfigDto {
    const instructions = doc.paymentInstructions?.trim();
    const updatedAt = (doc as PlatformPaymentSettingsDocument & {
      updatedAt?: Date;
    }).updatedAt;
    return {
      paymentQrImageUrl: doc.paymentQrImageUrl?.trim() || null,
      paymentInstructions: instructions || null,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
    };
  }
}
