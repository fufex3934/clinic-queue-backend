import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const PLATFORM_PAYMENT_SETTINGS_KEY = 'global';

@Schema({ timestamps: true, collection: 'platform_payment_settings' })
export class PlatformPaymentSettings {
  @Prop({ required: true, unique: true, default: PLATFORM_PAYMENT_SETTINGS_KEY })
  key: string;

  @Prop({ trim: true })
  paymentQrImageUrl?: string;

  @Prop({ trim: true, maxlength: 2000 })
  paymentInstructions?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export type PlatformPaymentSettingsDocument =
  HydratedDocument<PlatformPaymentSettings>;

export const PlatformPaymentSettingsSchema = SchemaFactory.createForClass(
  PlatformPaymentSettings,
);
