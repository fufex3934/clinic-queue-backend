import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clinic, ClinicSchema } from '../clinic/schemas/clinic.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import {
  PaymentRequest,
  PaymentRequestSchema,
} from './schemas/payment-request.schema';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import {
  PlatformPaymentSettings,
  PlatformPaymentSettingsSchema,
} from './schemas/platform-payment-settings.schema';
import { SubscriptionGuard } from './guards/subscription.guard';
import { SubscriptionService } from './subscription.service';
import { PlatformPaymentSettingsService } from './platform-payment-settings.service';

@Module({
  imports: [
    RealtimeModule,
    MongooseModule.forFeature([
      { name: PaymentRequest.name, schema: PaymentRequestSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      {
        name: PlatformPaymentSettings.name,
        schema: PlatformPaymentSettingsSchema,
      },
      { name: Clinic.name, schema: ClinicSchema },
    ]),
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    SubscriptionService,
    SubscriptionGuard,
    PlatformPaymentSettingsService,
  ],
  exports: [SubscriptionService, PaymentService, SubscriptionGuard],
})
export class PaymentModule {}
