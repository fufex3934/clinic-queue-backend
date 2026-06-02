import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

const BCRYPT_ROUNDS = 10;

enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
}

enum QueueStatus {
  WAITING = 'waiting',
  SERVING = 'serving',
}

enum UserRole {
  PLATFORM_ADMIN = 'platform_admin',
  ADMIN = 'admin',
  RECEPTIONIST = 'receptionist',
}

dotenv.config({ path: '.env' });

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }

  const clinicName = process.env.PILOT_CLINIC_NAME?.trim() || 'Pilot Clinic';
  const adminEmail =
    process.env.PILOT_ADMIN_EMAIL?.trim().toLowerCase() || 'admin@pilot.local';
  const receptionistEmail =
    process.env.PILOT_RECEPTIONIST_EMAIL?.trim().toLowerCase() ||
    'reception@pilot.local';
  const platformAdminEmail =
    process.env.PILOT_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase() ||
    'platform-admin@pilot.local';
  const pilotPassword = process.env.PILOT_USER_PASSWORD?.trim() || 'PilotPass123!';

  if (pilotPassword.length < 8) {
    throw new Error('PILOT_USER_PASSWORD must be at least 8 characters');
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const clinics = db.collection('clinics');
  const users = db.collection('users');
  const patients = db.collection('patients');
  const queues = db.collection('queues');
  const appointments = db.collection('appointments');

  const clinic =
    (await clinics.findOne({ name: clinicName })) ??
    (await clinics.findOne(
      { _id: (await clinics.insertOne({ name: clinicName, location: 'Pilot Site', createdAt: now, updatedAt: now })).insertedId },
    ));

  if (!clinic?._id) {
    throw new Error('Failed to create or load pilot clinic');
  }

  const passwordHash = await bcrypt.hash(pilotPassword, BCRYPT_ROUNDS);

  await upsertUser(users, {
    email: platformAdminEmail,
    role: UserRole.PLATFORM_ADMIN,
    name: 'Pilot Platform Admin',
    clinicId: clinic._id,
    passwordHash,
  });
  await upsertUser(users, {
    email: adminEmail,
    role: UserRole.ADMIN,
    name: 'Pilot Admin',
    clinicId: clinic._id,
    passwordHash,
  });
  await upsertUser(users, {
    email: receptionistEmail,
    role: UserRole.RECEPTIONIST,
    name: 'Pilot Reception',
    clinicId: clinic._id,
    passwordHash,
  });

  const samplePatients = [
    { name: 'Alice Johnson', phone: '+1-555-0101' },
    { name: 'Bob Smith', phone: '+1-555-0102' },
    { name: 'Charlie Davis', phone: '+1-555-0103' },
    { name: 'Diana Wilson', phone: '+1-555-0104' },
    { name: 'Ethan Brown', phone: '+1-555-0105' },
  ];

  const patientIds: mongoose.Types.ObjectId[] = [];
  for (const sample of samplePatients) {
    const existing = await patients.findOne({
      clinicId: clinic._id,
      phone: sample.phone,
    });
    if (existing?._id) {
      patientIds.push(existing._id as mongoose.Types.ObjectId);
      continue;
    }
    const insert = await patients.insertOne({
      clinicId: clinic._id,
      ...sample,
      createdAt: now,
    });
    patientIds.push(insert.insertedId);
  }

  await queues.deleteMany({ clinicId: clinic._id, date: today });
  await appointments.deleteMany({ clinicId: clinic._id, date: today });

  await queues.insertMany(
    patientIds.slice(0, 3).map((patientId, index) => ({
      clinicId: clinic._id,
      patientId,
      tokenNumber: index + 1,
      status: index === 0 ? QueueStatus.SERVING : QueueStatus.WAITING,
      date: today,
      createdAt: now,
      updatedAt: now,
    })),
  );

  await appointments.insertMany(
    patientIds.slice(0, 4).map((patientId, index) => ({
      clinicId: clinic._id,
      patientId,
      date: today,
      timeSlot: `0${9 + index}:00`,
      status:
        index === 0
          ? AppointmentStatus.CONFIRMED
          : AppointmentStatus.SCHEDULED,
      createdAt: now,
      updatedAt: now,
    })),
  );

  console.log('Pilot seed completed');
  console.log(`Clinic: ${clinicName}`);
  console.log(`Platform Admin: ${platformAdminEmail}`);
  console.log(`Admin: ${adminEmail}`);
  console.log(`Receptionist: ${receptionistEmail}`);
  console.log(`Password: ${pilotPassword}`);

  await mongoose.disconnect();
}

async function upsertUser(
  users: mongoose.mongo.Collection,
  payload: {
    email: string;
    role: UserRole;
    name: string;
    clinicId: mongoose.Types.ObjectId;
    passwordHash: string;
  },
): Promise<void> {
  await users.updateOne(
    { email: payload.email },
    {
      $set: {
        name: payload.name,
        role: payload.role,
        clinicId: payload.clinicId,
        passwordHash: payload.passwordHash,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

main().catch((error) => {
  console.error('Pilot seed failed:', error);
  process.exit(1);
});
