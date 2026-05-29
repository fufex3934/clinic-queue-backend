import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  /** Clinic-level administrator (scoped to one clinic). */
  ADMIN = 'admin',
  RECEPTIONIST = 'receptionist',
  /** SaaS operator — may manage all clinics. */
  PLATFORM_ADMIN = 'platform_admin',
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, lowercase: true, sparse: true, unique: true })
  email?: string;

  @Prop({ trim: true, sparse: true, unique: true })
  phone?: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: UserRole, required: true })
  role: UserRole;

  @Prop({ type: Types.ObjectId, ref: 'Clinic', required: true, index: true })
  clinicId: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
