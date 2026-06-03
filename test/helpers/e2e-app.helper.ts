import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { BCRYPT_ROUNDS } from '../../src/common/constants/security.constants';
import { UserRole } from '../../src/user/schemas/user.schema';

export interface E2eContext {
  app: INestApplication;
  replSet: MongoMemoryReplSet;
  clinicId: string;
}

export async function createE2eApp(): Promise<E2eContext> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  await replSet.waitUntilRunning();

  process.env.MONGODB_URI = replSet.getUri();
  process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-tests-min-32-chars';
  process.env.PLATFORM_ADMIN_EMAIL = '';
  process.env.PLATFORM_ADMIN_PASSWORD = '';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  const clinics = connection.collection('clinics');
  const users = connection.collection('users');

  const clinicInsert = await clinics.insertOne({
    name: 'E2E Clinic',
    location: 'Test',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const clinicId = clinicInsert.insertedId.toString();

  const passwordHash = await bcrypt.hash('password123', BCRYPT_ROUNDS);
  await users.insertOne({
    name: 'E2E Admin',
    email: 'e2e-admin@test.local',
    passwordHash,
    role: UserRole.ADMIN,
    clinicId: clinicInsert.insertedId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const now = new Date();
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() + 30);
  await connection.collection('subscriptions').insertOne({
    clinicId: clinicInsert.insertedId,
    plan: 'starter',
    startDate: now,
    endDate,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return { app, replSet, clinicId };
}

export async function closeE2eApp(ctx: E2eContext | undefined): Promise<void> {
  if (!ctx) return;
  await ctx.app.close();
  await ctx.replSet.stop();
}

export async function loginE2eAdmin(app: INestApplication): Promise<string> {
  const request = (await import('supertest')).default;
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ identifier: 'e2e-admin@test.local', password: 'password123' })
    .expect(200);

  return res.body.accessToken as string;
}
