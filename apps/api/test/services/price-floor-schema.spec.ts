import {
  adminUnitInputSchema,
  MIN_PRICE_PER_TERM_UGX,
  publishListingSchema,
  roomTypeInputSchema,
} from '@campushomes/shared';

// Kasubi Horizon's singles went live at UGX 2 per semester because these
// schemas only checked > 0. Every place that sets a real rent now enforces
// the UGX 50,000 floor (decided 2026-10-14).
const publish = (pricePerTermUgx: number) => ({
  listingId: '00000000-0000-4000-8000-000000000001',
  amenities: {},
  units: [{ label: 'Single 1', capacity: 1, roomCategory: 'single' as const, pricePerTermUgx }],
});

const roomType = (pricePerTermUgx: number) => ({
  title: 'Single',
  category: 'single' as const,
  bathroomType: 'shared' as const,
  capacity: 1,
  amenities: [],
  semesterId: '00000000-0000-4000-8000-000000000002',
  pricePerTermUgx,
  photos: [],
});

describe('rent floor', () => {
  it('is UGX 50,000', () => {
    expect(MIN_PRICE_PER_TERM_UGX).toBe(50_000);
  });

  it('rejects an Ops publish priced UGX 2', () => {
    expect(publishListingSchema.safeParse(publish(2)).success).toBe(false);
  });

  it('accepts an Ops publish priced exactly at the floor', () => {
    expect(publishListingSchema.safeParse(publish(MIN_PRICE_PER_TERM_UGX)).success).toBe(true);
  });

  it('rejects a landlord room type priced below the floor', () => {
    expect(roomTypeInputSchema.safeParse(roomType(49_999)).success).toBe(false);
  });

  it('rejects an admin unit priced below the floor', () => {
    expect(adminUnitInputSchema.safeParse({ label: 'S1', pricePerTermUgx: 2 }).success).toBe(false);
  });

  it('tells the person the minimum in the error', () => {
    const result = publishListingSchema.safeParse(publish(2));
    expect(result.error?.issues[0]?.message).toBe('Rent must be at least UGX 50,000 per semester');
  });
});
