/**
 * Full demo dataset: 4 clinics, staff, patients, appointments, queues, counters.
 *
 * Run from backend/:
 *   pnpm run seed:demo              # insert demo data (skip if already present)
 *   SEED_DEMO_RESET=true pnpm run seed:demo   # wipe demo data then re-seed
 */
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { MAX_APPOINTMENTS_PER_SLOT } from '../src/appointment/constants';
import {
  AppointmentStatus,
} from '../src/appointment/schemas/appointment.schema';
import { BCRYPT_ROUNDS } from '../src/common/constants/security.constants';
import { toDateKey, toStartOfDay } from '../src/common/utils/date.util';
import { toQueueScopeKey } from '../src/queue/utils/queue-scope.util';
import { QueueStatus } from '../src/queue/schemas/queue.schema';
import { UserRole } from '../src/user/schemas/user.schema';

dotenv.config({ path: '.env' });

const DEMO_DOMAIN = '@demo.clinic.local';
const DEMO_CLINIC_NAMES = [
  'Riverside Family Clinic',
  'Metro Care Center',
  'Sunrise Medical Clinic',
  'Harbor Health Partners',
] as const;

const TIME_SLOTS = buildTimeSlots();

interface DemoClinicDef {
  name: (typeof DEMO_CLINIC_NAMES)[number];
  location: string;
  slug: string;
}

const CLINIC_DEFS: DemoClinicDef[] = [
  {
    name: 'Riverside Family Clinic',
    location: '1200 River Road, Austin, TX',
    slug: 'riverside',
  },
  {
    name: 'Metro Care Center',
    location: '88 Metro Plaza, Denver, CO',
    slug: 'metro',
  },
  {
    name: 'Sunrise Medical Clinic',
    location: '45 Sunrise Blvd, Miami, FL',
    slug: 'sunrise',
  },
  {
    name: 'Harbor Health Partners',
    location: '9 Harbor View, Seattle, WA',
    slug: 'harbor',
  },
];

const PATIENT_FIRST = [
  'James',
  'Maria',
  'Robert',
  'Linda',
  'Michael',
  'Patricia',
  'David',
  'Jennifer',
  'William',
  'Elizabeth',
  'Richard',
  'Susan',
  'Joseph',
  'Jessica',
  'Thomas',
  'Sarah',
];

const PATIENT_LAST = [
  'Anderson',
  'Martinez',
  'Thompson',
  'Garcia',
  'Wilson',
  'Lee',
  'Brown',
  'Davis',
  'Miller',
  'Moore',
];

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI?.trim();
  const reset = process.env.SEED_DEMO_RESET === 'true';
  const password =
    process.env.SEED_DEMO_PASSWORD?.trim() ||
    process.env.SEED_ADMIN_PASSWORD?.trim() ||
    'DemoPass123!';

  if (!mongoUri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Demo password must be at least 8 characters');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  await dropLegacyQueueIndexes(mongoose.connection);

  const db = mongoose.connection;
  const clinicsCol = db.collection('clinics');
  const usersCol = db.collection('users');
  const patientsCol = db.collection('patients');
  const queuesCol = db.collection('queues');
  const countersCol = db.collection('queue_counters');
  const appointmentsCol = db.collection('appointments');

  if (reset) {
    await wipeDemoData(clinicsCol, usersCol, patientsCol, queuesCol, countersCol, appointmentsCol);
    console.log('Cleared existing demo data.');
  } else {
    const existing = await clinicsCol.findOne({ name: DEMO_CLINIC_NAMES[0] });
    if (existing) {
      console.log(
        `Demo clinics already exist (e.g. "${DEMO_CLINIC_NAMES[0]}"). ` +
          'Set SEED_DEMO_RESET=true to replace.',
      );
      await mongoose.disconnect();
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();
  const today = toStartOfDay();
  const dayOffsets = [-6, -5, -4, -3, -2, -1, 0];

  let totals = {
    clinics: 0,
    users: 0,
    patients: 0,
    queueEntries: 0,
    counters: 0,
    appointments: 0,
  };

  for (const def of CLINIC_DEFS) {
    const clinicInsert = await clinicsCol.insertOne({
      name: def.name,
      location: def.location,
      createdAt: now,
      updatedAt: now,
    });
    const clinicId = clinicInsert.insertedId;
    totals.clinics += 1;

    const staff = [
      {
        name: `${def.name} Admin`,
        email: `admin.${def.slug}${DEMO_DOMAIN}`,
        role: UserRole.ADMIN,
      },
      {
        name: `${def.slug} Reception — Ana`,
        email: `reception1.${def.slug}${DEMO_DOMAIN}`,
        role: UserRole.RECEPTIONIST,
      },
      {
        name: `${def.slug} Reception — Ben`,
        email: `reception2.${def.slug}${DEMO_DOMAIN}`,
        role: UserRole.RECEPTIONIST,
      },
    ];

    for (const s of staff) {
      await usersCol.insertOne({
        name: s.name,
        email: s.email,
        passwordHash,
        role: s.role,
        clinicId,
        createdAt: now,
        updatedAt: now,
      });
      totals.users += 1;
    }

    const patientIds: mongoose.Types.ObjectId[] = [];
    const patientCount = 14;
    for (let p = 0; p < patientCount; p += 1) {
      const first = PATIENT_FIRST[p % PATIENT_FIRST.length];
      const last = PATIENT_LAST[(p + def.slug.length) % PATIENT_LAST.length];
      const phoneSuffix = String(clinicId.getTimestamp().getSeconds() % 10) + String(p).padStart(2, '0');
      const insert = await patientsCol.insertOne({
        clinicId,
        name: `${first} ${last}`,
        phone: `+1-555-${def.slug.slice(0, 2).toUpperCase()}${phoneSuffix}-${String(1000 + p)}`,
        createdAt: new Date(now.getTime() - p * 86_400_000),
      });
      patientIds.push(insert.insertedId);
      totals.patients += 1;
    }

    for (const offset of dayOffsets) {
      const day = addUtcDays(today, offset);
      const dateKey = toDateKey(day);
      const scopeKey = toQueueScopeKey(clinicId.toString(), day);
      const isToday = offset === 0;

      const queueCount = isToday ? 9 : 4 + (Math.abs(offset) % 4);
      const queueDocs: Record<string, unknown>[] = [];
      let servingAssigned = false;

      for (let t = 1; t <= queueCount; t += 1) {
        const patientId = patientIds[(t + offset) % patientIds.length];
        let status: QueueStatus = QueueStatus.DONE;

        if (isToday) {
          if (t === queueCount && !servingAssigned) {
            status = QueueStatus.SERVING;
            servingAssigned = true;
          } else if (t > queueCount - 3) {
            status = QueueStatus.WAITING;
          } else {
            status = QueueStatus.DONE;
          }
        }

        queueDocs.push({
          clinicId,
          patientId,
          tokenNumber: t,
          status,
          date: day,
          createdAt: new Date(day.getTime() + t * 60_000),
          updatedAt: now,
        });
      }

      if (queueDocs.length > 0) {
        await queuesCol.insertMany(queueDocs);
        totals.queueEntries += queueDocs.length;
      }

      await countersCol.insertOne({
        scopeKey,
        clinicId,
        dateKey,
        lastToken: queueCount,
      });
      totals.counters += 1;

      const apptCount = isToday ? 12 : 5 + (Math.abs(offset) % 3);
      const apptDocs: Record<string, unknown>[] = [];
      const slotUsage = new Map<string, number>();

      for (let a = 0; a < apptCount; a += 1) {
        const slot = TIME_SLOTS[a % TIME_SLOTS.length];
        const used = slotUsage.get(slot) ?? 0;
        if (used >= MAX_APPOINTMENTS_PER_SLOT) continue;
        slotUsage.set(slot, used + 1);

        const patientId = patientIds[(a + offset * 2) % patientIds.length];
        let status: AppointmentStatus;

        if (isToday) {
          const mod = a % 6;
          if (mod === 0) status = AppointmentStatus.SCHEDULED;
          else if (mod === 1) status = AppointmentStatus.CONFIRMED;
          else if (mod === 2) status = AppointmentStatus.ARRIVED;
          else if (mod === 3) status = AppointmentStatus.COMPLETED;
          else if (mod === 4) status = AppointmentStatus.CANCELLED;
          else status = AppointmentStatus.NO_SHOW;
        } else if (offset === -1) {
          status =
            a % 3 === 0
              ? AppointmentStatus.COMPLETED
              : AppointmentStatus.ARRIVED;
        } else {
          status =
            a % 4 === 0
              ? AppointmentStatus.CANCELLED
              : AppointmentStatus.COMPLETED;
        }

        apptDocs.push({
          clinicId,
          patientId,
          date: day,
          timeSlot: slot,
          status,
          createdAt: new Date(day.getTime() + a * 120_000),
          updatedAt: now,
        });
      }

      if (apptDocs.length > 0) {
        await appointmentsCol.insertMany(apptDocs);
        totals.appointments += apptDocs.length;
      }
    }

    console.log(`  ✓ ${def.name}`);
  }

  console.log('\nDemo seed completed.\n');
  console.log('Summary:', totals);
  console.log('\nDemo logins (password from SEED_DEMO_PASSWORD or SEED_ADMIN_PASSWORD):');
  for (const def of CLINIC_DEFS) {
    console.log(`  ${def.name}`);
    console.log(`    admin.${def.slug}${DEMO_DOMAIN}`);
    console.log(`    reception1.${def.slug}${DEMO_DOMAIN}`);
  }
  console.log(`\nPlatform admin (if configured in .env): ${process.env.PLATFORM_ADMIN_EMAIL ?? 'n/a'}`);
  console.log(`Original seed admin: ${process.env.SEED_ADMIN_EMAIL ?? 'n/a'}`);

  await mongoose.disconnect();
}

/** Older DBs may have global unique indexes — breaks multi-clinic seed. */
async function dropLegacyQueueIndexes(db: mongoose.Connection): Promise<void> {
  const queuesCol = db.collection('queues');
  const countersCol = db.collection('queue_counters');

  for (const col of [queuesCol, countersCol]) {
    const indexes = await col.indexes();
    for (const idx of indexes) {
      if (!idx.key || idx.name === '_id_') continue;

      const keys = Object.keys(idx.key);
      const isLegacyQueue =
        col.collectionName === 'queues' &&
        keys.includes('date') &&
        keys.includes('tokenNumber') &&
        !keys.includes('clinicId');
      const isLegacyCounter =
        col.collectionName === 'queue_counters' &&
        keys.includes('dateKey') &&
        !keys.includes('scopeKey') &&
        !keys.includes('clinicId');

      if ((isLegacyQueue || isLegacyCounter) && idx.name) {
        await col.dropIndex(idx.name);
        console.warn(
          `Dropped legacy index "${idx.name}" on ${col.collectionName}.`,
        );
      }
    }
  }
}

async function wipeDemoData(
  clinicsCol: mongoose.mongo.Collection,
  usersCol: mongoose.mongo.Collection,
  patientsCol: mongoose.mongo.Collection,
  queuesCol: mongoose.mongo.Collection,
  countersCol: mongoose.mongo.Collection,
  appointmentsCol: mongoose.mongo.Collection,
): Promise<void> {
  const demoUsers = await usersCol
    .find({ email: { $regex: `@demo\\.clinic\\.local$` } })
    .project({ clinicId: 1 })
    .toArray();

  const demoClinics = await clinicsCol
    .find({ name: { $in: [...DEMO_CLINIC_NAMES] } })
    .project({ _id: 1 })
    .toArray();

  const clinicIds = [
    ...new Set([
      ...demoUsers.map((u) => u.clinicId as mongoose.Types.ObjectId),
      ...demoClinics.map((c) => c._id as mongoose.Types.ObjectId),
    ]),
  ];

  if (clinicIds.length > 0) {
    await Promise.all([
      patientsCol.deleteMany({ clinicId: { $in: clinicIds } }),
      queuesCol.deleteMany({ clinicId: { $in: clinicIds } }),
      countersCol.deleteMany({ clinicId: { $in: clinicIds } }),
      appointmentsCol.deleteMany({ clinicId: { $in: clinicIds } }),
      usersCol.deleteMany({ clinicId: { $in: clinicIds } }),
      clinicsCol.deleteMany({ _id: { $in: clinicIds } }),
    ]);
  }

  await usersCol.deleteMany({ email: { $regex: `@demo\\.clinic\\.local$` } });
}

function addUtcDays(base: Date, offset: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offset);
  return toStartOfDay(d.toISOString());
}

function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 9; hour <= 17; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 17 && minute === 30) break;
      slots.push(
        `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      );
    }
  }
  return slots;
}

main().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
