import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentRequestDocument = HydratedDocument<PaymentRequest>;

export enum PaymentRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum SubscriptionPlan {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

@Schema({ timestamps: true, collection: 'payment_requests' })
export class PaymentRequest {
  @Prop({ type: Types.ObjectId, ref: 'Clinic', required: true, index: true })
  clinicId: Types.ObjectId;

  @Prop({ required: true, enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    required: true,
    enum: PaymentRequestStatus,
    default: PaymentRequestStatus.PENDING,
    index: true,
  })
  status: PaymentRequestStatus;

  @Prop({ trim: true })
  proofImage?: string;

  @Prop()
  approvedAt?: Date;
}

export const PaymentRequestSchema =
  SchemaFactory.createForClass(PaymentRequest);
