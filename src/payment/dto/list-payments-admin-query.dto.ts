import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentRequestStatus } from '../schemas/payment-request.schema';
import { SubscriptionPlan } from '../schemas/payment-request.schema';

export class ListPaymentsAdminQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @IsMongoId()
  clinicId?: string;

  @IsOptional()
  @IsIn([
    PaymentRequestStatus.PENDING,
    PaymentRequestStatus.APPROVED,
    PaymentRequestStatus.REJECTED,
  ])
  status?: PaymentRequestStatus;

  @IsOptional()
  @IsIn([
    SubscriptionPlan.STARTER,
    SubscriptionPlan.PROFESSIONAL,
    SubscriptionPlan.ENTERPRISE,
  ])
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsIn(['createdAt', 'amount', 'plan', 'status'])
  sortBy?: 'createdAt' | 'amount' | 'plan' | 'status';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
