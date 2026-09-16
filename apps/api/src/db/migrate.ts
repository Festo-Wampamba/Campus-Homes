import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/**
 * Applies forward-only SQL migrations before the API starts.
 *
 * The runtime DATABASE_URL intentionally connects as the low-privilege
 * application role, so it cannot safely alter schemas or grants. Deployments
 * that opt into this runner must provide DATABASE_MIGRATIONS_URL for the
 * migration owner; it is deliberately separate from DATABASE_URL.
 */
async function main() {
  const migrationUrl = process.env.DATABASE_MIGRATIONS_URL;
  if (!migrationUrl) return;

  const pool = new Pool({ connectionString: migrationUrl, max: 1 });
  const client = await pool.connect();
  try {
    // Dokploy normally runs one replica, but an advisory lock makes this safe
    // if a rollout or a future environment starts multiple containers.
    await client.query("SELECT pg_advisory_lock(hashtext('campushomes-schema-migrations'))");
    await migrate(drizzle(client), {
      migrationsFolder: join(process.cwd(), 'migrations'),
    });
    console.log('Database migrations are current.');
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('campushomes-schema-migrations'))");
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
});
