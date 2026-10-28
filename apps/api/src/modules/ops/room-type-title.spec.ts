import { roomTypeTitle } from './ops.service';

it('names a general room type on its own', () => {
  expect(roomTypeTitle('double')).toBe('Double Room');
});

it("puts the landlord's variant after the general type", () => {
  expect(roomTypeTitle('single', 'Executive')).toBe('Single Room - Executive');
});

it("uses an 'other' room's label as its whole name", () => {
  expect(roomTypeTitle('other', 'Penthouse suite')).toBe('Penthouse suite');
});
