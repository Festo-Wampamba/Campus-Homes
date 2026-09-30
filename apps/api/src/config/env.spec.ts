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
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', WEB_ORIGIN: 'https://example.test', AUTH_APP_URL: 'https://example.test', LOGTO_ENDPOINT: 'https://auth.example.test', TRUSTED_PROXY_CIDRS: 'uniquelocal' })).not.toThrow();
  });
  it('never includes invalid values in errors', () => {
    expect(() => loadEnv({ ...base, WEB_ORIGIN: 'secret-value' })).toThrow(/^Invalid environment configuration: WEB_ORIGIN$/);
  });
  describe('TRUSTED_PROXY_CIDRS', () => {
    const prod = { ...base, NODE_ENV: 'production', WEB_ORIGIN: 'https://example.test', AUTH_APP_URL: 'https://example.test' };
    it('refuses to boot in production without it', () => {
      expect(() => loadEnv(prod)).toThrow('Production requires TRUSTED_PROXY_CIDRS');
    });
    it('accepts a CIDR in production and exposes the parsed list', () => {
      expect(loadEnv({ ...prod, TRUSTED_PROXY_CIDRS: '10.0.0.0/8, 172.18.0.5 ,' }).TRUSTED_PROXY_CIDRS).toEqual(['10.0.0.0/8', '172.18.0.5']);
    });
    it('accepts an Express preset', () => {
      expect(loadEnv({ ...prod, TRUSTED_PROXY_CIDRS: 'uniquelocal' }).TRUSTED_PROXY_CIDRS).toEqual(['uniquelocal']);
    });
    it('accepts an IPv6 address and CIDR', () => {
      expect(loadEnv({ ...prod, TRUSTED_PROXY_CIDRS: '::1,fd00::/8' }).TRUSTED_PROXY_CIDRS).toEqual(['::1', 'fd00::/8']);
    });
    it.each(['10.0.0.0/8', '172.16.0.0/12', 'fc00::/7', '173.245.48.0/20', '2400:cb00::/32'])('accepts wide-but-real range %s', (value) => {
      expect(loadEnv({ ...base, TRUSTED_PROXY_CIDRS: value }).TRUSTED_PROXY_CIDRS).toEqual([value]);
    });
    it.each(['0.0.0.0/1', '128.0.0.0/1', '10.0.0.0/7', '::/1', 'fc00::/6', '::ffff:0:0/96', '::ffff:10.0.0.0/104', '::FFFF:1.2.3.4', '::ffff:1.2.3.4/128'])('rejects over-broad or IPv4-mapped entry %s', (value) => {
      expect(() => loadEnv({ ...base, TRUSTED_PROXY_CIDRS: value })).toThrow(/^Invalid environment configuration: TRUSTED_PROXY_CIDRS$/);
    });
    it.each(['::/7', '::/8', '::1/80', '0:0:0:0:0:ffff:0:0/96', '::ffff:0:0/96'])('rejects IPv6 range %s that matches IPv4-mapped peers', (value) => {
      expect(() => loadEnv({ ...base, TRUSTED_PROXY_CIDRS: value })).toThrow(/^Invalid environment configuration: TRUSTED_PROXY_CIDRS$/);
    });
    it.each(['fc00::/7', '2400:cb00::/32', '2606:4700::/32', '10.0.0.0/8', 'uniquelocal'])('still accepts %s', (value) => {
      expect(loadEnv({ ...base, TRUSTED_PROXY_CIDRS: value }).TRUSTED_PROXY_CIDRS).toEqual([value]);
    });
    it('trusts no proxy in development when unset', () => {
      expect(loadEnv(base).TRUSTED_PROXY_CIDRS).toEqual([]);
    });
    it.each(['0.0.0.0/0', '::/0', '*', 'true', '10.0.0.0/33', 'fd00::/129', '10.0.0.0/-1', '10.0.0.0/', 'not-an-ip', '10.0.0.0/8,0.0.0.0/0', '10.0.0.0/08x'])('rejects unsafe entry %s', (value) => {
      expect(() => loadEnv({ ...base, TRUSTED_PROXY_CIDRS: value })).toThrow(/^Invalid environment configuration: TRUSTED_PROXY_CIDRS$/);
    });
  });
});
