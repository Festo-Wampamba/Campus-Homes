import { pickPasswordEmailKind } from '../../src/modules/auth/auth.email';

describe('pickPasswordEmailKind', () => {
  it('sends a set-password email when no credential account exists yet', () => {
    expect(pickPasswordEmailKind(false)).toBe('set-password');
  });

  it('sends a reset-password email when a credential account already exists', () => {
    expect(pickPasswordEmailKind(true)).toBe('reset-password');
  });
});
