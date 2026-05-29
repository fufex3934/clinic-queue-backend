import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;

@Schema({ timestamps: true, collection: 'password_reset_tokens' })
export class PasswordResetToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  usedAt: Date | null;
}

export const PasswordResetTokenSchema =
  SchemaFactory.createForClass(PasswordResetToken);

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
