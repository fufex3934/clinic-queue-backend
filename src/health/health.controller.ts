import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SkipSubscription } from '../payment/decorators/skip-subscription.decorator';

@Controller('health')
@SkipSubscription()
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async check() {
    const mongoState = this.connection.readyState;
    const states: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    let dbPingMs: number | null = null;
    let dbOk = false;

    if (mongoState === 1 && this.connection.db) {
      const start = Date.now();
      try {
        await this.connection.db.admin().command({ ping: 1 });
        dbPingMs = Date.now() - start;
        dbOk = true;
      } catch {
        dbOk = false;
      }
    }

    const replicaSet = process.env.MONGODB_URI?.includes('replicaSet=')
      ? process.env.MONGODB_URI.match(/replicaSet=([^&]+)/)?.[1] ?? null
      : null;

    return {
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      mongodb: {
        state: states[mongoState] ?? 'unknown',
        connected: mongoState === 1,
        pingMs: dbPingMs,
        replicaSet: replicaSet || null,
      },
    };
  }
}
