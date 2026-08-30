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
    });
  });

  it('allows Redis to be disabled in runtimes where no connection is configured', async () => {
    await expect(controller(undefined, null).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'disabled' },
      commit: expect.any(String),
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
    });
  });
});
