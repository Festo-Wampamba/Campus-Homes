import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { loadEnv } from '../config/env';
import { createDb, createDbPool, type Db } from './client';
import { withRlsContext, type RlsContext } from './rls-context';

export const DB_POOL = 'DB_POOL';

/**
 * Every domain query runs through here: a transaction with the caller's
 * identity bound as RLS session variables. Services never touch the pool
 * directly — that would bypass row-level security context.
 */
@Injectable()
export class RlsDb {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  run<T>(ctx: RlsContext, fn: (db: Db, client: PoolClient) => Promise<T>): Promise<T> {
    return withRlsContext(this.pool, ctx, (client) => fn(createDb(client), client));
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      useFactory: (): Pool => createDbPool(loadEnv().DATABASE_URL),
    },
    RlsDb,
  ],
  exports: [DB_POOL, RlsDb],
})
export class DbModule {}
