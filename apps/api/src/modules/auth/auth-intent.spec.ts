import { authIntent } from '@campushomes/shared';

describe('authentication entry intent', () => {
  it('preserves legacy staff and enrollment links', () => {
    expect(authIntent(undefined, 'staff', '/admin')).toBe('staff');
    expect(authIntent(undefined, 'consumer', '/landlords/enroll?from=nav')).toBe('landlord');
    expect(authIntent(undefined, 'consumer', '/search')).toBe('student');
  });
  it('never downgrades a staff portal through consumer intent', () => {
    expect(authIntent('landlord', 'staff')).toBe('staff');
    expect(authIntent('staff', 'consumer')).toBe('staff');
  });
  it('does not treat an unsafe destination as landlord enrollment', () => {
    expect(authIntent(undefined, 'consumer', '//evil.test/landlords/enroll')).toBe('student');
  });
});
