import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import { Connection } from 'mongoose';
import {
  closeE2eApp,
  createE2eApp,
  E2eContext,
  loginE2eAdmin,
} from '../helpers/e2e-app.helper';

describe('Queue serve-next concurrency (e2e)', () => {
  let ctx: E2eContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
    token = await loginE2eAdmin(ctx.app);
  }, 180000);

  afterAll(async () => {
    await closeE2eApp(ctx);
  }, 60000);

  beforeEach(async () => {
    const connection = ctx.app.get<Connection>(getConnectionToken());
    await connection.collection('queues').deleteMany({});
    await connection.collection('queue_counters').deleteMany({});

    const patients = connection.collection('patients');
    await patients.deleteMany({});

    for (let i = 0; i < 10; i++) {
      const p = await request(ctx.app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Patient ${i}`, phone: `+1555000${1000 + i}` });

      await request(ctx.app.getHttpServer())
        .post('/queue/add')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: p.body._id });
    }
  }, 60000);

  it('only one patient is serving after 10 concurrent serve-next calls', async () => {
    const server = ctx.app.getHttpServer();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        request(server)
          .patch('/queue/serve-next')
          .set('Authorization', `Bearer ${token}`),
      ),
    );

    const httpResponses = results
      .filter((r): r is PromiseFulfilledResult<request.Response> => r.status === 'fulfilled')
      .map((r) => r.value);

    const successCount = httpResponses.filter((r) => r.status === 200).length;
    expect(successCount).toBeGreaterThanOrEqual(1);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const connection = ctx.app.get<Connection>(getConnectionToken());
    const servingCount = await connection
      .collection('queues')
      .countDocuments({ status: 'serving' });

    expect(servingCount).toBe(1);
  }, 60000);
});
