import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClinicDocument = HydratedDocument<Clinic>;

@Schema({ timestamps: true, collection: 'clinics' })
export class Clinic {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  location: string;
}

export const ClinicSchema = SchemaFactory.createForClass(Clinic);
