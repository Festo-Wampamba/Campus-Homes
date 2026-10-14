import { publishListingSchema, updatePropertySchema, withAmenity } from '@campushomes/shared';

// Kasubi Horizon was published as both "Unfurnished" and "Fully furnished".
// Furnishing is now one choice: the forms untick the other levels and the
// input schemas reject more than one.
const publish = (amenities: Record<string, boolean>) => ({
  listingId: '00000000-0000-4000-8000-000000000001',
  amenities,
  units: [{ label: 'Single 1', capacity: 1, roomCategory: 'single' as const, pricePerTermUgx: 500_000 }],
});

describe('furnishing level', () => {
  it('rejects an Ops publish with two furnishing levels', () => {
    expect(publishListingSchema.safeParse(publish({ unfurnished: true, fully_furnished: true })).success).toBe(false);
  });

  it('accepts an Ops publish with one furnishing level', () => {
    expect(publishListingSchema.safeParse(publish({ partly_furnished: true, wifi: true })).success).toBe(true);
  });

  it('rejects a landlord property update with two furnishing levels', () => {
    expect(
      updatePropertySchema.safeParse({ furnishingItems: { partly_furnished: true, unfurnished: true } }).success,
    ).toBe(false);
  });

  it('unticks the other furnishing levels when one is ticked', () => {
    expect(withAmenity({ unfurnished: true, wifi: true }, 'fully_furnished', true)).toEqual({
      unfurnished: false,
      partly_furnished: false,
      fully_furnished: true,
      wifi: true,
    });
  });

  it('leaves other checklist items alone', () => {
    expect(withAmenity({ unfurnished: true }, 'wifi', true)).toEqual({ unfurnished: true, wifi: true });
  });
});
