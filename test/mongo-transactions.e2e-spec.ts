import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { assertTransactionsSupported } from './helpers/mongo-memory.helper';
import { closeE2eApp, createE2eApp, E2eContext } from './helpers/e2e-app.helper';

describe('MongoDB transactions (e2e bootstrap)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 180000);

  afterAll(async () => {
    await closeE2eApp(ctx);
  }, 60000);

  it('uses a replica set URI and supports withTransaction', async () => {
    expect(process.env.MONGODB_URI).toMatch(/replicaSet=/i);

    const connection = ctx.app.get<Connection>(getConnectionToken());
    await assertTransactionsSupported(connection);
  });
});
