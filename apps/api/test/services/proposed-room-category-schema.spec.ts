/**
 * Landlord room proposals are stored as jsonb after passing this schema; zod
 * strips undeclared keys, so a field missing here silently never reaches Ops.
 */
import { proposedRoomCategorySchema } from '@campushomes/shared';

it('keeps the bed spaces a landlord proposes for a dormitory', () => {
  const parsed = proposedRoomCategorySchema.parse({
    category: 'dormitory', roomCount: 2, pricePerTermUgx: 300000, bedsPerRoom: 8,
  });

  expect(parsed.bedsPerRoom).toBe(8);
});
