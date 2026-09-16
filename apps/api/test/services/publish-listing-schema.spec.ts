import { MAX_PUBLISH_UNITS, publishListingSchema } from '@campushomes/shared';

// A large hostel publishes one unit per physical room, so a single publish can
// legitimately exceed the old 200 cap (200 singles + 100 doubles = 300). This
// pins the raised ceiling and that the boundary rejects one over.
const unit = (i: number) => ({
  label: `Single ${i + 1}`,
  capacity: 1,
  roomCategory: 'single' as const,
  pricePerTermUgx: 10000,
});

const base = { listingId: '00000000-0000-4000-8000-000000000001', amenities: {} };

describe('publishListingSchema unit cap', () => {
  it('accepts a large property (300 rooms) that the old 200 cap rejected', () => {
    const units = Array.from({ length: 300 }, (_, i) => unit(i));
    expect(publishListingSchema.safeParse({ ...base, units }).success).toBe(true);
  });

  it('rejects one unit over the maximum', () => {
    const units = Array.from({ length: MAX_PUBLISH_UNITS + 1 }, (_, i) => unit(i));
    expect(publishListingSchema.safeParse({ ...base, units }).success).toBe(false);
  });
});
