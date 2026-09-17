import { ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

import { HealthController } from './health.controller';

function controller(
  query: jest.Mock = jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  ping: jest.Mock | null = jest.fn().mockResolvedValue('PONG'),
) {
  const pool = { query } as unknown as Pool;
  const redis = ping ? ({ ping } as unknown as Redis) : null;
  return new HealthController(pool, redis);
}

describe('HealthController', () => {
  it('reports both required runtime dependencies as healthy', async () => {
    await expect(controller().check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
      commit: expect.any(String),
      schema: expect.any(Object),
    });
  });

  it('allows Redis to be disabled in runtimes where no connection is configured', async () => {
    await expect(controller(undefined, null).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'disabled' },
      commit: expect.any(String),
      schema: expect.any(Object),
    });
  });

  it.each([
    ['database', jest.fn().mockRejectedValue(new Error('database unavailable')), jest.fn().mockResolvedValue('PONG')],
    ['redis', jest.fn().mockResolvedValue({ rows: [] }), jest.fn().mockRejectedValue(new Error('redis unavailable'))],
  ])('returns a safe degraded response when %s is down', async (_name, query, ping) => {
    let failure: unknown;
    try {
      await controller(query, ping).check();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toEqual({
      status: 'degraded',
      checks: expect.objectContaining({ database: expect.any(String), redis: expect.any(String) }),
      commit: expect.any(String),
      schema: expect.any(Object),
    });
  });

  it('reports how many migrations the database has applied', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ applied: 46 }] });
    const result = await controller(query).check();
    expect((result as { schema: { applied: number | null } }).schema.applied).toBe(46);
  });

  // Query order in check(): SELECT 1, then to_regclass, then the count.
  it('reports applied as null when the migrations table cannot be read', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ present: true }] })
      .mockRejectedValueOnce(new Error('permission denied for schema drizzle'));
    const result = await controller(query).check();
    expect((result as { schema: { applied: number | null } }).schema.applied).toBeNull();
  });

  // The distinction that makes a null `applied` actionable: the ledger being
  // present but unreadable means migrations ran and the role lacks a grant,
  // while absent means they never ran against this database at all.
  it('reports the migrations ledger as present when it exists but cannot be counted', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ present: true }] })
      .mockRejectedValueOnce(new Error('permission denied for schema drizzle'));
    const result = await controller(query).check();
    expect((result as { schema: { ledgerPresent: boolean | null } }).schema.ledgerPresent).toBe(true);
  });

  it('reports the migrations ledger as absent when migrations never ran', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ present: false }] })
      .mockRejectedValueOnce(new Error('relation does not exist'));
    const result = await controller(query).check();
    expect((result as { schema: { ledgerPresent: boolean | null } }).schema.ledgerPresent).toBe(false);
  });
});
