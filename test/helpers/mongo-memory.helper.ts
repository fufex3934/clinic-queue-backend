import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection } from 'mongoose';

const PROBE_COLLECTION = '__transaction_probe';

/** Single-node replica set — supports multi-document transactions in tests. */
export async function startMemoryReplicaSet(): Promise<MongoMemoryReplSet> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      name: 'rs0',
      storageEngine: 'wiredTiger',
    },
  });
  await replSet.waitUntilRunning();
  return replSet;
}

/**
 * Fails fast when the test database cannot run transactions.
 * Call after Mongoose connects (e.g. from createE2eApp).
 */
export async function assertTransactionsSupported(
  connection: Connection,
): Promise<void> {
  const admin = connection.db?.admin();
  if (!admin) {
    throw new Error('MongoDB admin API unavailable — cannot verify replica set');
  }

  const status = (await admin.command({ replSetGetStatus: 1 })) as {
    ok?: number;
  };
  if (status?.ok !== 1) {
    throw new Error(
      'Test MongoDB is not a replica set — multi-document transactions are unavailable',
    );
  }

  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await connection.db!.collection(PROBE_COLLECTION).insertOne(
        { probe: true, at: new Date() },
        { session },
      );
    });
  } finally {
    await session.endSession();
    await connection.db!.collection(PROBE_COLLECTION).deleteMany({ probe: true });
  }
}
