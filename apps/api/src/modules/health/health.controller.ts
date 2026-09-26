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

// How many migrations this image ships. Compared against what the database has
// actually applied so schema drift — an image deployed against a database that
// never ran its migrations — is visible from outside instead of surfacing as an
// unexplained 500 in whichever feature the missing migration backed.
function readExpectedMigrations(): number {
  try {
    const journal: unknown = JSON.parse(
      readFileSync(join(process.cwd(), 'migrations/meta/_journal.json'), 'utf8'),
    );
    const entries = (journal as { entries?: unknown[] }).entries;
    return Array.isArray(entries) ? entries.length : -1;
  } catch {
    return -1;
  }
}

const EXPECTED_MIGRATIONS = readExpectedMigrations();

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

    // Reported, never fatal: a drifted schema must not fail the deploy gate,
    // it must be legible. `applied: null` means the migrations table could not
    // be read (missing, or not granted to the runtime role) — itself a finding.
    let applied: number | null = null;
    // pg_catalog is readable by every role, so this distinguishes the two very
    // different meanings of `applied: null`: the ledger being absent means
    // migrations have never run against this database at all, while present-
    // but-unreadable means they have run and the runtime role simply lacks the
    // grant. Without it a null is ambiguous exactly when it matters most.
    let ledgerPresent: boolean | null = null;
    try {
      const { rows } = await this.pool.query<{ present: boolean }>(
        "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
      );
      ledgerPresent = rows[0]?.present ?? null;
    } catch {
      // Same posture as the checks above: state only, details stay server-side.
    }
    try {
      const { rows } = await this.pool.query<{ applied: number }>(
        'SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations',
      );
      applied = rows[0]?.applied ?? null;
    } catch {
      // Same posture as the checks above: state only, details stay server-side.
    }
    const schema = { applied, ledgerPresent, expected: EXPECTED_MIGRATIONS };

    if (checks.database !== 'up' || checks.redis === 'down') {
      throw new ServiceUnavailableException({ status: 'degraded', checks, commit: COMMIT_SHA, schema });
    }
    return { status: 'ok', checks, commit: COMMIT_SHA, schema };
  }
}
