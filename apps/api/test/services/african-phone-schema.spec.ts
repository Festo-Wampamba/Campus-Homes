/**
 * africanPhone backs every contact-phone field (onboarding, profiles, admin
 * user editor, staff invite). Uganda numbers must be exactly 10 digits in
 * local form (07XXXXXXXX), i.e. 9 after +256; other countries stay loose.
 */
import { africanPhone } from '@campushomes/shared';

const ugError = (value: string) => africanPhone.safeParse(value).error?.issues[0]?.message;

it('rejects a 7-digit Uganda number with a 10-digit hint', () => {
  expect(ugError('+256778398')).toMatch(/10 digits/);
});

it('rejects a Uganda number one digit short', () => {
  expect(africanPhone.safeParse('+25677839812').success).toBe(false);
});

it('rejects a Uganda number one digit long', () => {
  expect(africanPhone.safeParse('+2567783981234').success).toBe(false);
});

it('accepts a full Uganda number typed with spaces', () => {
  expect(africanPhone.parse('+256 778 398 123')).toBe('+256778398123');
});

it('keeps the loose length rule for other African countries', () => {
  expect(africanPhone.safeParse('+2547123456').success).toBe(true);
});
