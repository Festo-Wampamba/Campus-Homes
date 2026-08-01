import type { Env } from '../../config/env';

type AuthDatabaseEnv = Pick<Env, 'AUTH_DATABASE_URL' | 'DATABASE_URL'>;

export function resolveAuthDatabaseUrl(env: AuthDatabaseEnv): string {
  const databaseUrl = env.AUTH_DATABASE_URL ?? env.DATABASE_URL;

  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('AUTH_DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (hostname.includes('-pooler.')) {
    throw new Error(
      'Better Auth requires a direct Neon connection: set AUTH_DATABASE_URL with connection pooling disabled',
    );
  }

  return databaseUrl;
}
