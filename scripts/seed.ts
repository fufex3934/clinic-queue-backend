/**
 * Idempotent production seed: default clinic + clinic admin.
 * Run: pnpm run seed (from backend/)
 */
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { BCRYPT_ROUNDS } from '../src/common/constants/security.constants';
import { UserRole } from '../src/user/schemas/user.schema';

dotenv.config({ path: '.env' });

const SEED_CLINIC_LOCATION = 'Seeded via SEED script';

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const clinicName = process.env.SEED_CLINIC_NAME?.trim() || 'Default Clinic';
  const mongoUri = process.env.MONGODB_URI?.trim();

  if (!mongoUri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('SEED_ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const clinics = mongoose.connection.collection('clinics');
  const users = mongoose.connection.collection('users');

  const existingAdmin = await users.findOne({ email });
  if (existingAdmin) {
    console.log(`Seed skipped: admin already exists (${email})`);
    await mongoose.disconnect();
    return;
  }

  let clinic = await clinics.findOne({ name: clinicName });
  if (!clinic) {
    const insert = await clinics.insertOne({
      name: clinicName,
      location: SEED_CLINIC_LOCATION,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    clinic = await clinics.findOne({ _id: insert.insertedId });
    console.log(`Created clinic: ${clinicName}`);
  } else {
    console.log(`Using existing clinic: ${clinicName}`);
  }

  if (!clinic?._id) {
    console.error('Failed to resolve clinic for seed');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await users.insertOne({
    name: 'Clinic Administrator',
    email,
    passwordHash,
    role: UserRole.ADMIN,
    clinicId: clinic._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`Created clinic admin: ${email}`);
  console.log('Seed completed successfully.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
