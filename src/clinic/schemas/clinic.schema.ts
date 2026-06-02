import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClinicDocument = HydratedDocument<Clinic>;

@Schema({ timestamps: true, collection: 'clinics' })
export class Clinic {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: '09:00', trim: true })
  workingHoursStart: string;

  @Prop({ default: '17:00', trim: true })
  workingHoursEnd: string;

  @Prop({ default: 5, min: 1, max: 20 })
  maxAppointmentsPerSlot: number;
}

export const ClinicSchema = SchemaFactory.createForClass(Clinic);
