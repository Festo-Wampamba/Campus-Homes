import { Module, type INestApplication } from '@nestjs/common';
import { APP_PIPE, NestFactory } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { ZodValidationPipe } from 'nestjs-zod';

import { EventsController } from '../../src/modules/listings/events.controller';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { writeRateLimit } from '../../src/rate-limit';

const recorded: unknown[] = [];

@Module({
  controllers: [EventsController],
  providers: [
    { provide: ListingsService, useValue: { recordEvent: async (event: unknown) => recorded.push(event) } },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
class EventsTestModule {}

function fakeRedis(): Redis {
  const counts = new Map<string, number>();
  return {
    incr: async (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1).get(key),
    expire: async () => 1,
  } as unknown as Redis;
}

let app: INestApplication;
let base: string;

beforeAll(async () => {
  app = await NestFactory.create(EventsTestModule, { logger: false });
  app.getHttpAdapter().getInstance().use('/api/v1', writeRateLimit(fakeRedis(), { limit: 2, windowSec: 60 }));
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1/events`;
});

afterAll(() => app.close());

function post(body: unknown, ip: string) {
  return fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(body),
  }).then((res) => res.status);
}

describe('POST /api/v1/events', () => {
  it('accepts a page view', async () => {
    expect(await post({ type: 'page_view', path: '/search' }, '10.0.0.1')).toBe(204);
  });

  it('rejects a path with a query string', async () => {
    expect(await post({ type: 'page_view', path: '/search?q=x' }, '10.0.0.2')).toBe(400);
  });

  it('rate-limits a client past the write budget', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push(await post({ type: 'page_view', path: '/' }, '10.0.0.3'));
    expect(statuses).toEqual([204, 204, 429]);
  });
});
