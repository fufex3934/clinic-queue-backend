import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

const REPLICA_SET_WARNING =
  'Queue transactions require MongoDB replica set for full safety. ' +
  'Standalone MongoDB may not apply multi-document transactions reliably. ' +
  'See docs/MONGODB_PRODUCTION.md';

@Injectable()
export class MongoReplicaCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MongoReplicaCheckService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.checkReplicaSet();
  }

  async checkReplicaSet(): Promise<boolean> {
    try {
      const admin = this.connection.db?.admin();
      if (!admin) {
        this.logger.warn(REPLICA_SET_WARNING);
        return false;
      }

      const status = (await admin.command({ replSetGetStatus: 1 })) as {
        ok?: number;
      };

      if (status?.ok === 1) {
        this.logger.log('MongoDB replica set detected — transactions supported');
        return true;
      }
    } catch {
      // replSetGetStatus fails on standalone — fall through to warning
    }

    this.logger.warn(REPLICA_SET_WARNING);
    return false;
  }
}
