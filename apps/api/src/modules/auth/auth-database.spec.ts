import { resolveAuthDatabaseUrl } from './auth-database';

describe('resolveAuthDatabaseUrl', () => {
  const directUrl = 'postgresql://app:secret@ep-example.us-east-2.aws.neon.tech/neondb';
  const pooledUrl =
    'postgresql://app:secret@ep-example-pooler.us-east-2.aws.neon.tech/neondb';

  it('uses the dedicated auth database URL when configured', () => {
    expect(
      resolveAuthDatabaseUrl({
        DATABASE_URL: pooledUrl,
        AUTH_DATABASE_URL: directUrl,
      }),
    ).toBe(directUrl);
  });

  it('allows the main database URL when it is already direct', () => {
    expect(resolveAuthDatabaseUrl({ DATABASE_URL: directUrl })).toBe(directUrl);
  });

  it('fails fast when Better Auth would use a Neon pooled endpoint', () => {
    expect(() => resolveAuthDatabaseUrl({ DATABASE_URL: pooledUrl })).toThrow(
      'Better Auth requires a direct Neon connection',
    );
  });

  it('fails fast for an invalid dedicated auth URL', () => {
    expect(() =>
      resolveAuthDatabaseUrl({
        DATABASE_URL: directUrl,
        AUTH_DATABASE_URL: 'not-a-url',
      }),
    ).toThrow('AUTH_DATABASE_URL must be a valid PostgreSQL connection URL');
  });
});
