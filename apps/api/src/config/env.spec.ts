import { loadEnv } from './env';

describe('security configuration', () => {
  const base = { DATABASE_URL: 'postgresql://example.invalid/test' };
  it('normalizes the one CORS origin and permits local development', () => {
    expect(loadEnv({ ...base, WEB_ORIGIN: 'https://campushomes.test/' }).WEB_ORIGIN).toBe('https://campushomes.test');
    expect(loadEnv(base).WEB_ORIGIN).toBe('http://localhost:3000');
  });
  it.each(['*', 'https://one.test,https://two.test', 'https://user:secret@example.test', 'https://example.test/path', 'https://example.test/?q=x'])('rejects unsafe origin %s', (origin) => {
    expect(() => loadEnv({ ...base, WEB_ORIGIN: origin })).toThrow('Invalid environment configuration: WEB_ORIGIN');
  });
  it('requires HTTPS for production browser-facing authentication', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow('Production requires HTTPS');
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', WEB_ORIGIN: 'https://example.test', AUTH_APP_URL: 'https://example.test', LOGTO_ENDPOINT: 'https://auth.example.test' })).not.toThrow();
  });
  it('never includes invalid values in errors', () => {
    expect(() => loadEnv({ ...base, WEB_ORIGIN: 'secret-value' })).toThrow(/^Invalid environment configuration: WEB_ORIGIN$/);
  });
});
