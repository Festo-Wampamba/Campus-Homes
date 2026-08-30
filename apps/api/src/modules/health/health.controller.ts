import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

import { DB_POOL } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';

// Baked in at image build time (apps/api/Dockerfile) so the deploy health
// gate can tell a new rollout apart from the outgoing container it replaced.
function readCommitSha(): string {
  try {
    return readFileSync(join(__dirname, '../../../../commit_sha.txt'), 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

const COMMIT_SHA = readCommitSha();

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
      throw new ServiceUnavailableException({ status: 'degraded', checks, commit: COMMIT_SHA });
    }
    return { status: 'ok', checks, commit: COMMIT_SHA };
  }
}
