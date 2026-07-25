import { loadEnv } from './env';
import { assertStubAllowed } from './integration-guard';

// Exercises the real schema rather than a hand-built Env, so the
// ALLOW_STUB_INTEGRATIONS parsing and the guard are covered as one unit.
function env(overrides: Record<string, string>) {
  return loadEnv({ DATABASE_URL: 'postgresql://localhost/test', ...overrides });
}

const guard = (overrides: Record<string, string>) => () =>
  assertStubAllowed(env(overrides), 'FLUTTERWAVE_SECRET_KEY', 'ReservationsModule');

describe('assertStubAllowed', () => {
  it('throws in production when the opt-in is absent', () => {
    expect(guard({ NODE_ENV: 'production' })).toThrow(
      'ReservationsModule requires FLUTTERWAVE_SECRET_KEY in production',
    );
  });

  it('allows the stub in production when explicitly opted in', () => {
    expect(guard({ NODE_ENV: 'production', ALLOW_STUB_INTEGRATIONS: 'true' })).not.toThrow();
  });

  // z.coerce.boolean() would read the string 'false' as true and silently
  // disarm the guard — the specific reason the schema compares strings.
  it('keeps the guard armed when the opt-in is the string "false"', () => {
    expect(guard({ NODE_ENV: 'production', ALLOW_STUB_INTEGRATIONS: 'false' })).toThrow();
  });

  it('keeps the guard armed when the opt-in is misspelled', () => {
    expect(guard({ NODE_ENV: 'production', ALLOW_STUB_INTEGRATIONS: 'TRUE ' })).toThrow();
  });

  it('never blocks outside production', () => {
    expect(guard({ NODE_ENV: 'development' })).not.toThrow();
  });
});
