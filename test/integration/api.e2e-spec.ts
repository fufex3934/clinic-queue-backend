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
});
