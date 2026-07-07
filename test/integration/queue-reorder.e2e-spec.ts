import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import { Connection, Model, Types } from 'mongoose';
import { QueueService } from '../../src/queue/queue.service';
import { QueueDocument } from '../../src/queue/schemas/queue.schema';
import {
  closeE2eApp,
  createE2eApp,
  E2eContext,
  loginE2eAdmin,
} from '../helpers/e2e-app.helper';

type WaitingRow = { id: string; tokenNumber: number };

async function seedWaitingQueue(
  server: ReturnType<INestApplication['getHttpServer']>,
  token: string,
  count: number,
): Promise<string[]> {
  const entryIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const patient = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Reorder Patient ${count}-${i}`,
        phone: `+1557${String(Date.now()).slice(-6)}${i}`,
      })
      .expect(201);

    const entry = await request(server)
      .post('/queue/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: patient.body._id })
      .expect(201);

    entryIds.push(entry.body._id as string);
  }
  return entryIds;
}

async function getWaitingRows(
  connection: Connection,
  clinicId: string,
): Promise<WaitingRow[]> {
  const rows = await connection
    .collection('queues')
    .find({
      clinicId: new Types.ObjectId(clinicId),
      status: 'waiting',
    })
    .sort({ tokenNumber: 1 })
    .toArray();

  return rows.map((row) => ({
    id: row._id.toString(),
    tokenNumber: row.tokenNumber as number,
  }));
}

async function assertNoDuplicateTokens(
  connection: Connection,
  clinicId: string,
): Promise<void> {
  const duplicates = await connection
    .collection('queues')
    .aggregate([
      { $match: { clinicId: new Types.ObjectId(clinicId) } },
      {
        $group: {
          _id: { date: '$date', tokenNumber: '$tokenNumber' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  expect(duplicates).toEqual([]);
}

function tokenOrderByIds(rows: WaitingRow[], ids: string[]): number[] {
  const byId = new Map(rows.map((row) => [row.id, row.tokenNumber]));
  return ids.map((id) => byId.get(id)!);
}

describe('Queue reorder safety (e2e)', () => {
  let ctx: E2eContext;
  let token: string;
  let connection: Connection;

  beforeAll(async () => {
    ctx = await createE2eApp();
    connection = ctx.app.get<Connection>(getConnectionToken());
    token = await loginE2eAdmin(ctx.app);
  }, 180000);

  afterAll(async () => {
    await closeE2eApp(ctx);
  }, 60000);

  beforeEach(async () => {
    await connection.collection('queues').deleteMany({});
    await connection.collection('queue_counters').deleteMany({});
    await connection.collection('patients').deleteMany({});
  }, 60000);

  async function reorder(orderedEntryIds: string[]) {
    return request(ctx.app.getHttpServer())
      .patch('/queue/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderedEntryIds });
  }

  it('swaps two adjacent waiting entries', async () => {
    const [a, b, c] = await seedWaitingQueue(ctx.app.getHttpServer(), token, 3);

    const res = await reorder([b, a, c]);
    expect(res.status).toBe(200);

    const rows = await getWaitingRows(connection, ctx.clinicId);
    expect(tokenOrderByIds(rows, [a, b, c])).toEqual([2, 1, 3]);
    await assertNoDuplicateTokens(connection, ctx.clinicId);
  }, 60000);

  it('reverses the entire waiting queue', async () => {
    const entryIds = await seedWaitingQueue(ctx.app.getHttpServer(), token, 5);
    const reversed = [...entryIds].reverse();

    const res = await reorder(reversed);
    expect(res.status).toBe(200);

    const rows = await getWaitingRows(connection, ctx.clinicId);
    expect(tokenOrderByIds(rows, entryIds)).toEqual([5, 4, 3, 2, 1]);
    await assertNoDuplicateTokens(connection, ctx.clinicId);
  }, 60000);

  it('reorders a large waiting queue (12 entries)', async () => {
    const entryIds = await seedWaitingQueue(ctx.app.getHttpServer(), token, 12);
    const reversed = [...entryIds].reverse();

    const res = await reorder(reversed);
    expect(res.status).toBe(200);

    const rows = await getWaitingRows(connection, ctx.clinicId);
    expect(rows).toHaveLength(12);
    expect(tokenOrderByIds(rows, entryIds)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    await assertNoDuplicateTokens(connection, ctx.clinicId);
  }, 120000);

  it('rolls back when phase 2 fails (no partial reorder)', async () => {
    const entryIds = await seedWaitingQueue(ctx.app.getHttpServer(), token, 4);
    const before = await getWaitingRows(connection, ctx.clinicId);
    const swapped = [entryIds[1], entryIds[0], entryIds[2], entryIds[3]];

    const queueService = ctx.app.get(QueueService);
    const queueModel = (queueService as unknown as { queueModel: Model<QueueDocument> })
      .queueModel;
    const originalUpdateOne = queueModel.updateOne.bind(queueModel);

    const spy = jest.spyOn(queueModel, 'updateOne').mockImplementation(
      ((filter: unknown, update: unknown, options?: unknown) => {
        const query = (
          originalUpdateOne as (
            f: unknown,
            u: unknown,
            o?: unknown,
          ) => ReturnType<typeof queueModel.updateOne>
        )(filter, update, options);
        const tokenNumber =
          typeof update === 'object' && update !== null && 'tokenNumber' in update
            ? (update as { tokenNumber: number }).tokenNumber
            : null;

        if (typeof tokenNumber === 'number' && tokenNumber > 0) {
          return {
            exec: () => Promise.reject(new Error('forced phase 2 failure')),
          } as ReturnType<typeof queueModel.updateOne>;
        }

        return query;
      }) as typeof queueModel.updateOne,
    );

    const res = await reorder(swapped);
    spy.mockRestore();

    expect(res.status).toBeGreaterThanOrEqual(400);

    const after = await getWaitingRows(connection, ctx.clinicId);
    expect(after).toEqual(before);
    expect(after.map((row) => row.tokenNumber)).toEqual([1, 2, 3, 4]);
    expect(after.every((row) => row.tokenNumber > 0)).toBe(true);
    await assertNoDuplicateTokens(connection, ctx.clinicId);
  }, 60000);

  it('keeps tokenNumber unique under concurrent reorder requests', async () => {
    const entryIds = await seedWaitingQueue(ctx.app.getHttpServer(), token, 8);
    const reversed = [...entryIds].reverse();
    const rotated = [entryIds[1], entryIds[2], entryIds[3], entryIds[4], entryIds[5], entryIds[6], entryIds[7], entryIds[0]];

    const results = await Promise.allSettled([
      reorder(reversed),
      reorder(rotated),
    ]);

    const statuses = results
      .filter((r): r is PromiseFulfilledResult<request.Response> => r.status === 'fulfilled')
      .map((r) => r.value.status);

    expect(statuses.some((status) => status === 200)).toBe(true);

    await assertNoDuplicateTokens(connection, ctx.clinicId);

    const rows = await getWaitingRows(connection, ctx.clinicId);
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.tokenNumber > 0)).toBe(true);
    expect(new Set(rows.map((row) => row.tokenNumber)).size).toBe(8);
  }, 120000);
});
