/**
 * Additive dashboard demo data for an existing clinic (Atlas/local).
 *
 * Does not delete patients or users unless SEED_REPLACE_HISTORY=true.
 *
 * Usage (from backend/):
 *   pnpm run seed:dashboard
 *
 * Env:
 *   MONGODB_URI          — required
 *   SEED_CLINIC_ID       — optional MongoDB ObjectId
 *   SEED_CLINIC_NAME     — optional; else uses the only clinic if count === 1
 *   SEED_DAYS            — history window including today (default 7)
 *   SEED_EXTRA_PATIENTS  — new patients to insert (default 24)
 *   SEED_REPLACE_HISTORY — if "true", removes queue/appointments for this clinic in the window first
 *   SEED_PAYMENTS        — if "true", adds approved payment_requests for revenue chart (default true)
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  ARRIVED = 'arrived',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
}

enum QueueStatus {
  WAITING = 'waiting',
  SERVING = 'serving',
  DONE = 'done',
  SKIPPED = 'skipped',
}

enum PaymentRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
}

enum SubscriptionPlan {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

const PLAN_AMOUNTS: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.STARTER]: 29,
  [SubscriptionPlan.PROFESSIONAL]: 79,
  [SubscriptionPlan.ENTERPRISE]: 199,
};

const TIME_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

const DEMO_PATIENT_NAMES = [
  'Abebe Kebede',
  'Tigist Haile',
  'Dawit Tesfaye',
  'Hanna Girma',
  'Yonas Mekonnen',
  'Selam Alemu',
  'Bereket Negash',
  'Meron Desta',
  'Kidus Solomon',
  'Rahel Bekele',
  'Samuel Fikadu',
  'Eden Worku',
  'Nahom Assefa',
  'Liya Demissie',
  'Daniel Getachew',
  'Sara Mulatu',
  'Michael Tadesse',
  'Helen Berhanu',
  'Robel Hailu',
  'Marta Yohannes',
  'Fitsum Arega',
  'Betty Lemma',
  'Henok Teshome',
  'Ruth Gebre',
  'Paulos Alemayehu',
  'Feven Tadesse',
  'Elias Chernet',
  'Mahlet Shiferaw',
  'Brook Tekle',
  'Hiwot Amanuel',
];

function toUtcStartOfDay(base: Date = new Date()): Date {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()),
  );
}

function toDateKey(date: Date): string {
  return toUtcStartOfDay(date).toISOString().slice(0, 10);
}

function addUtcDays(base: Date, offset: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function pickN<T>(items: T[], n: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

async function resolveClinic(
  clinics: mongoose.mongo.Collection,
): Promise<mongoose.mongo.WithId<mongoose.mongo.BSON.Document>> {
  const idRaw = process.env.SEED_CLINIC_ID?.trim();
  if (idRaw) {
    if (!mongoose.Types.ObjectId.isValid(idRaw)) {
      throw new Error(`SEED_CLINIC_ID is not a valid ObjectId: ${idRaw}`);
    }
    const clinic = await clinics.findOne({
      _id: new mongoose.Types.ObjectId(idRaw),
    });
    if (!clinic) {
      throw new Error(`No clinic found for SEED_CLINIC_ID=${idRaw}`);
    }
    return clinic;
  }

  const name = process.env.SEED_CLINIC_NAME?.trim();
  if (name) {
    const clinic = await clinics.findOne({ name });
    if (!clinic) {
      throw new Error(`No clinic found with name "${name}"`);
    }
    return clinic;
  }

  const all = await clinics.find({}).sort({ name: 1 }).toArray();
  if (all.length === 1) {
    return all[0]!;
  }
  if (all.length === 0) {
    throw new Error('No clinics in database. Create a clinic first.');
  }

  console.error('Multiple clinics found. Set SEED_CLINIC_ID or SEED_CLINIC_NAME:');
  for (const c of all) {
    console.error(`  - ${c._id}  ${c.name}`);
  }
  throw new Error('Ambiguous clinic; set SEED_CLINIC_ID or SEED_CLINIC_NAME');
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }

  const days = Math.max(1, Number(process.env.SEED_DAYS ?? 7) || 7);
  const extraPatients = Math.max(
    0,
    Number(process.env.SEED_EXTRA_PATIENTS ?? 24) || 24,
  );
  const replaceHistory =
    process.env.SEED_REPLACE_HISTORY?.trim().toLowerCase() === 'true';
  const seedPayments =
    (process.env.SEED_PAYMENTS ?? 'true').trim().toLowerCase() !== 'false';

  await mongoose.connect(mongoUri);
  const db = mongoose.connection;

  const clinics = db.collection('clinics');
  const patients = db.collection('patients');
  const queues = db.collection('queues');
  const appointments = db.collection('appointments');
  const queueCounters = db.collection('queue_counters');
  const subscriptions = db.collection('subscriptions');
  const paymentRequests = db.collection('payment_requests');

  const clinic = await resolveClinic(clinics);
  const clinicId = clinic._id as mongoose.Types.ObjectId;
  const now = new Date();
  const today = toUtcStartOfDay(now);

  const dayDates: Date[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dayDates.push(addUtcDays(today, -offset));
  }

  if (replaceHistory) {
    const deletedQueue = await queues.deleteMany({
      clinicId,
      date: { $in: dayDates },
    });
    const deletedAppts = await appointments.deleteMany({
      clinicId,
      date: { $in: dayDates },
    });
    console.log(
      `Cleared history window: ${deletedQueue.deletedCount} queue, ${deletedAppts.deletedCount} appointments`,
    );
  }

  const existingPatients = await patients
    .find({ clinicId })
    .project({ _id: 1 })
    .toArray();
  const patientIds = existingPatients.map(
    (p) => p._id as mongoose.Types.ObjectId,
  );

  let createdPatients = 0;
  for (let i = 0; i < extraPatients; i += 1) {
    const name = DEMO_PATIENT_NAMES[i % DEMO_PATIENT_NAMES.length]!;
    const phone = `+251-900-SEED-${String(1000 + i).padStart(4, '0')}`;
    const existing = await patients.findOne({ clinicId, phone });
    if (existing?._id) {
      if (!patientIds.some((id) => id.equals(existing._id as mongoose.Types.ObjectId))) {
        patientIds.push(existing._id as mongoose.Types.ObjectId);
      }
      continue;
    }
    const insert = await patients.insertOne({
      clinicId,
      name: `${name} ${i > DEMO_PATIENT_NAMES.length - 1 ? i + 1 : ''}`.trim(),
      phone,
      gender: i % 2 === 0 ? 'male' : 'female',
      createdAt: addUtcDays(now, -(i % 14)),
    });
    patientIds.push(insert.insertedId);
    createdPatients += 1;
  }

  if (patientIds.length < 5) {
    throw new Error('Need at least 5 patients for demo seed');
  }

  let queueInserted = 0;
  let appointmentsInserted = 0;

  for (let dayIndex = 0; dayIndex < dayDates.length; dayIndex += 1) {
    const date = dayDates[dayIndex]!;
    const isToday = date.getTime() === today.getTime();
    const dayPast = dayDates.length - 1 - dayIndex;

    const existingMaxToken = await queues
      .find({ clinicId, date })
      .sort({ tokenNumber: -1 })
      .limit(1)
      .toArray();
    let nextToken =
      (existingMaxToken[0]?.tokenNumber as number | undefined) ?? 0;

    const queueTarget = isToday ? 10 : 6 + (dayIndex % 5);
    const dayPatients = pickN(patientIds, Math.min(queueTarget, patientIds.length));

    const queueDocs: mongoose.mongo.OptionalId<mongoose.mongo.BSON.Document>[] =
      [];

    for (let i = 0; i < dayPatients.length; i += 1) {
      nextToken += 1;
      const status = resolveQueueStatus(isToday, i, dayPatients.length);
      const createdAt = addUtcDays(date, 0);
      createdAt.setUTCHours(8 + (i % 6), (i * 7) % 60, 0, 0);
      const updatedAt = new Date(createdAt);
      if (status === QueueStatus.DONE) {
        updatedAt.setUTCMinutes(updatedAt.getUTCMinutes() + 12 + (i % 25));
      } else if (status === QueueStatus.SERVING) {
        updatedAt.setUTCMinutes(updatedAt.getUTCMinutes() + 5);
      }

      queueDocs.push({
        clinicId,
        patientId: dayPatients[i],
        tokenNumber: nextToken,
        status,
        date,
        createdAt,
        updatedAt,
      });
    }

    if (queueDocs.length > 0) {
      await queues.insertMany(queueDocs);
      queueInserted += queueDocs.length;
    }

    await queueCounters.updateOne(
      { scopeKey: `${clinicId.toString()}:${toDateKey(date)}` },
      {
        $set: {
          clinicId,
          dateKey: toDateKey(date),
          lastToken: nextToken,
        },
      },
      { upsert: true },
    );

    const apptTarget = isToday ? 14 : 8 + (dayIndex % 4);
    const apptPatients = pickN(
      patientIds,
      Math.min(apptTarget, patientIds.length),
    );
    const apptDocs: mongoose.mongo.OptionalId<mongoose.mongo.BSON.Document>[] =
      [];

    for (let i = 0; i < apptPatients.length; i += 1) {
      const slot = TIME_SLOTS[i % TIME_SLOTS.length]!;
      const status = resolveAppointmentStatus(isToday, i);
      const createdAt = addUtcDays(date, 0);
      createdAt.setUTCHours(7, i % 50, 0, 0);

      apptDocs.push({
        clinicId,
        patientId: apptPatients[i],
        date,
        timeSlot: slot,
        status,
        createdAt,
        updatedAt: createdAt,
      });
    }

    if (apptDocs.length > 0) {
      await appointments.insertMany(apptDocs);
      appointmentsInserted += apptDocs.length;
    }

    void dayPast;
  }

  const subStart = addUtcDays(today, -10);
  const subEnd = addUtcDays(today, 25);
  await subscriptions.updateOne(
    { clinicId },
    {
      $set: {
        plan: SubscriptionPlan.PROFESSIONAL,
        startDate: subStart,
        endDate: subEnd,
        isActive: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  let paymentsInserted = 0;
  if (seedPayments) {
    const approvedCount = await paymentRequests.countDocuments({
      clinicId,
      status: PaymentRequestStatus.APPROVED,
    });
    if (approvedCount < 3) {
      const months = [2, 1, 0];
      for (const monthsAgo of months) {
        const approvedAt = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 15),
        );
        const plan =
          monthsAgo % 2 === 0
            ? SubscriptionPlan.STARTER
            : SubscriptionPlan.PROFESSIONAL;
        await paymentRequests.insertOne({
          clinicId,
          plan,
          amount: PLAN_AMOUNTS[plan],
          status: PaymentRequestStatus.APPROVED,
          approvedAt,
          createdAt: addUtcDays(approvedAt, -2),
          updatedAt: approvedAt,
        });
        paymentsInserted += 1;
      }
    }
  }

  console.log('Dashboard seed completed (additive)');
  console.log(`Clinic: ${clinic.name} (${clinicId.toString()})`);
  console.log(`Patients in pool: ${patientIds.length} (+${createdPatients} new)`);
  console.log(`Queue entries added: ${queueInserted}`);
  console.log(`Appointments added: ${appointmentsInserted}`);
  console.log(`Subscription active until: ${subEnd.toISOString().slice(0, 10)}`);
  if (seedPayments) {
    console.log(`Approved payments added: ${paymentsInserted}`);
  }
  console.log('');
  console.log('Reload the dashboard in the browser to see charts.');
  if (!replaceHistory && queueInserted > 0) {
    console.log(
      'Tip: set SEED_REPLACE_HISTORY=true to clear only the last N days of queue/appointments before re-seeding.',
    );
  }

  await mongoose.disconnect();
}

function resolveQueueStatus(
  isToday: boolean,
  index: number,
  total: number,
): QueueStatus {
  if (!isToday) {
    if (index % 9 === 0) return QueueStatus.SKIPPED;
    return QueueStatus.DONE;
  }
  if (index === 0) return QueueStatus.SERVING;
  if (index < Math.ceil(total * 0.45)) return QueueStatus.DONE;
  if (index < Math.ceil(total * 0.65)) return QueueStatus.WAITING;
  if (index % 7 === 0) return QueueStatus.SKIPPED;
  return pick([QueueStatus.DONE, QueueStatus.WAITING]);
}

function resolveAppointmentStatus(
  isToday: boolean,
  index: number,
): AppointmentStatus {
  if (!isToday) {
    const past = [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.ARRIVED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];
    return past[index % past.length]!;
  }
  const todayMix = [
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.ARRIVED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ];
  return todayMix[index % todayMix.length]!;
}

main().catch((error) => {
  console.error('Dashboard seed failed:', error);
  process.exit(1);
});
