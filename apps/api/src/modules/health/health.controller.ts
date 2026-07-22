import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

import { DB_POOL } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    @Optional() @Inject(REDIS) private readonly redis: Redis | null,
  ) {}

  @Get()
  async check() {
    const checks = {
      database: 'down' as 'up' | 'down',
      redis: (this.redis ? 'down' : 'disabled') as 'up' | 'down' | 'disabled',
    };

    try {
      await this.pool.query('SELECT 1');
      checks.database = 'up';
    } catch {
      // Keep error details server-side; readiness responses expose state only.
    }

    if (this.redis) {
      try {
        await this.redis.ping();
        checks.redis = 'up';
      } catch {
        // Same posture as the database check above.
      }
    }

    if (checks.database !== 'up' || checks.redis === 'down') {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }
    return { status: 'ok', checks };
  }
}
