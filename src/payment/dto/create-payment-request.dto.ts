import { IsEnum, IsNumber, Min } from 'class-validator';
import { SubscriptionPlan } from '../schemas/payment-request.schema';

export class CreatePaymentRequestDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @IsNumber()
  @Min(0)
  amount: number;
}
