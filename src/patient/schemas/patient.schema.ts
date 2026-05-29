import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PatientDocument = HydratedDocument<Patient>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'patients',
})
export class Patient {
  @Prop({ type: Types.ObjectId, ref: 'Clinic', required: true, index: true })
  clinicId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  phone: string;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

PatientSchema.index({ clinicId: 1, phone: 1 }, { unique: true });
