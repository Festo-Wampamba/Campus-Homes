import { loadEnv } from './env';
import { assertPaymentsEnabled, PAYMENTS_DISABLED_MESSAGE } from './payment-guard';

function env(value?: string) {
  return loadEnv({
    DATABASE_URL: 'postgresql://localhost/test',
    ...(value === undefined ? {} : { PAYMENTS_ENABLED: value }),
  });
}

describe('payment launch gate', () => {
  it('is disabled by default', () => {
    expect(() => assertPaymentsEnabled(env())).toThrow(PAYMENTS_DISABLED_MESSAGE);
  });

  it('enables payments only for the exact string "true"', () => {
    expect(() => assertPaymentsEnabled(env('true'))).not.toThrow();
  });

  it.each(['false', 'TRUE', '1', ' true '])('stays disabled for %p', (value) => {
    expect(() => assertPaymentsEnabled(env(value))).toThrow(PAYMENTS_DISABLED_MESSAGE);
  });
});
