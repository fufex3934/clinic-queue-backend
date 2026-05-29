import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type QueueDocument = HydratedDocument<Queue>;

export enum QueueStatus {
  WAITING = 'waiting',
  SERVING = 'serving',
  DONE = 'done',
}

@Schema({ timestamps: true, collection: 'queues' })
export class Queue {
  @Prop({ type: Types.ObjectId, ref: 'Clinic', required: true, index: true })
  clinicId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true, index: true })
  patientId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  tokenNumber: number;

  @Prop({
    type: String,
    enum: QueueStatus,
    default: QueueStatus.WAITING,
    index: true,
  })
  status: QueueStatus;

  /** Calendar day for this queue entry (start of day UTC). */
  @Prop({ required: true, index: true })
  date: Date;
}

export const QueueSchema = SchemaFactory.createForClass(Queue);

QueueSchema.index({ clinicId: 1, date: 1, tokenNumber: 1 }, { unique: true });
/** FIFO serve-next: lowest token among waiting entries for this clinic + day */
QueueSchema.index({ clinicId: 1, date: 1, status: 1, tokenNumber: 1 });
