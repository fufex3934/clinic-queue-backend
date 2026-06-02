import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type QueueCounterDocument = HydratedDocument<QueueCounter>;

/**
 * Per-clinic daily token sequence.
 * `scopeKey` = `${clinicId}:${dateKey}` — never shared across clinics.
 */
@Schema({ collection: 'queue_counters' })
export class QueueCounter {
  @Prop({ required: true, unique: true })
  scopeKey: string;

  @Prop({ type: Types.ObjectId, ref: 'Clinic', required: true, index: true })
  clinicId: Types.ObjectId;

  @Prop({ required: true })
  dateKey: string;

  @Prop({ required: true, default: 0, min: 0 })
  lastToken: number;
}

export const QueueCounterSchema = SchemaFactory.createForClass(QueueCounter);
