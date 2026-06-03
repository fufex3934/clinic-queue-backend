import request from 'supertest';
import {
  closeE2eApp,
  createE2eApp,
  E2eContext,
  loginE2eAdmin,
} from '../helpers/e2e-app.helper';

describe('API integration (e2e)', () => {
  let ctx: E2eContext;
  let token: string;
  let patientId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
    token = await loginE2eAdmin(ctx.app);
  }, 180000);

  afterAll(async () => {
    await closeE2eApp(ctx);
  }, 60000);

  it('POST /auth/login returns access token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'e2e-admin@test.local', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.clinicId).toBeDefined();
  });

  it('POST /patients creates a patient', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jane Doe', phone: '+15550001111' });

    expect(res.status).toBe(201);
    patientId = res.body._id;
  });

  it('POST /queue/add assigns a token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/queue/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId });

    expect(res.status).toBe(201);
    expect(res.body.tokenNumber).toBe(1);
    expect(res.body.status).toBe('waiting');
  });

  it('PATCH /queue/serve-next promotes patient to serving', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch('/queue/serve-next')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('serving');
    expect(res.body.tokenNumber).toBe(1);
  });

  it('POST /appointments/book creates appointment', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(ctx.app.getHttpServer())
      .post('/appointments/book')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        date: today,
        timeSlot: '09:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.timeSlot).toBe('09:00');
  });

  it('POST /appointments/:id/confirm confirms appointment', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const book = await request(ctx.app.getHttpServer())
      .post('/appointments/book')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId, date: today, timeSlot: '10:00' });

    const appointmentId = book.body._id as string;
    const res = await request(ctx.app.getHttpServer())
      .post(`/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('PATCH /queue/:id/skip skips a waiting entry', async () => {
    const add = await request(ctx.app.getHttpServer())
      .post('/queue/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId });

    const entryId = add.body._id as string;
    const res = await request(ctx.app.getHttpServer())
      .patch(`/queue/${entryId}/skip`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('skipped');
  });

  it('rejects booking when slot is at capacity', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const slot = '11:00';

    for (let i = 0; i < 5; i++) {
      const p = await request(ctx.app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Slot Patient ${i}`, phone: `+1555000${1000 + i}` });
      await request(ctx.app.getHttpServer())
        .post('/appointments/book')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: p.body._id, date: today, timeSlot: slot })
        .expect(201);
    }

    const overflow = await request(ctx.app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Overflow', phone: '+15559999001' });

    const res = await request(ctx.app.getHttpServer())
      .post('/appointments/book')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId: overflow.body._id,
        date: today,
        timeSlot: slot,
      });

    expect(res.status).toBe(409);
  });

  it('POST /auth/forgot-password and reset-password flow', async () => {
    const forgot = await request(ctx.app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ identifier: 'e2e-admin@test.local' });

    expect(forgot.status).toBe(200);
    expect(forgot.body.resetToken).toBeDefined();

    const reset = await request(ctx.app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        token: forgot.body.resetToken,
        password: 'newpassword123',
      });

    expect(reset.status).toBe(200);

    const loginOld = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'e2e-admin@test.local', password: 'password123' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'e2e-admin@test.local', password: 'newpassword123' });
    expect(loginNew.status).toBe(200);
    token = loginNew.body.accessToken;
  });

  it('GET /health includes MongoDB ping', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.mongodb?.connected).toBe(true);
  });
});
