/** DB specs TRUNCATE tables, so they must never fall back to a default database. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL must be set to a disposable database; this suite truncates tables');
  }
  return url;
}
