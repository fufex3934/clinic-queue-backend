import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import * as dotenv from 'dotenv';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Clinic,
  ClinicDocument,
} from '../src/clinic/schemas/clinic.schema';
import { SubscriptionService } from '../src/payment/subscription.service';
import {
  Subscription,
  SubscriptionDocument,
} from '../src/payment/schemas/subscription.schema';

dotenv.config({ path: '.env' });

async function findClinicsWithoutSubscription(
  clinicModel: Model<ClinicDocument>,
  subscriptionModel: Model<SubscriptionDocument>,
): Promise<{ id: string; name: string }[]> {
  const [clinics, subscriptions] = await Promise.all([
    clinicModel.find().select('_id name').lean().exec(),
    subscriptionModel.find().select('clinicId').lean().exec(),
  ]);

  const subscribed = new Set(
    subscriptions.map((s) => s.clinicId.toString()),
  );

  return clinics
    .filter((c) => !subscribed.has(c._id.toString()))
    .map((c) => ({ id: c._id.toString(), name: c.name }));
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const subscriptionService = app.get(SubscriptionService);
    const clinicModel = app.get<Model<ClinicDocument>>(
      getModelToken(Clinic.name),
    );
    const subscriptionModel = app.get<Model<SubscriptionDocument>>(
      getModelToken(Subscription.name),
    );

    const missing = await findClinicsWithoutSubscription(
      clinicModel,
      subscriptionModel,
    );

    if (missing.length === 0) {
      console.log('All clinics already have a subscription document.');
      return;
    }

    console.log(`Found ${missing.length} clinic(s) without subscription.`);

    let provisioned = 0;
    for (const clinic of missing) {
      const { allowed, subscription } =
        await subscriptionService.ensureClinicCanOperate(clinic.id);
      provisioned += 1;
      console.log(
        `  ${clinic.name} (${clinic.id}): plan=${subscription.plan} allowed=${allowed}`,
      );
    }

    console.log(`Done. Provisioned ${provisioned} starter trial(s).`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
