import { contentSecurityPolicy } from './content-security-policy';

describe('contentSecurityPolicy', () => {
  it('requires nonce scripts in production without unsafe script exceptions', () => {
    const policy = contentSecurityPolicy('random-request-nonce', false);
    const scripts = policy.split('; ').find((item) => item.startsWith('script-src'))!;
    expect(scripts).toContain("'nonce-random-request-nonce'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain('unsafe-inline');
    expect(scripts).not.toContain('unsafe-eval');
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('permits local development tooling without forcing HTTPS', () => {
    const policy = contentSecurityPolicy('dev-nonce', true);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain('ws://localhost:*');
    expect(policy).not.toContain('upgrade-insecure-requests');
  });
});
