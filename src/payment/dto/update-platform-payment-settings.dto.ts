import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformPaymentSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  paymentInstructions?: string;
}
