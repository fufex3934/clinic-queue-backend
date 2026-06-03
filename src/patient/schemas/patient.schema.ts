import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PatientDocument = HydratedDocument<Patient>;

export enum PatientGender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'patients',
})
export class Patient {
  @Prop({ type: Types.ObjectId, ref: 'Clinic', required: true, index: true })
  clinicId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, index: true })
  phone: string;

  @Prop({ type: Date })
  dateOfBirth?: Date;

  @Prop({ type: String, enum: PatientGender })
  gender?: PatientGender;

  @Prop({ trim: true })
  secondaryPhone?: string;

  @Prop({ trim: true, maxlength: 500 })
  notes?: string;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

PatientSchema.index({ clinicId: 1, phone: 1 });
PatientSchema.index({ clinicId: 1, name: 1 });
