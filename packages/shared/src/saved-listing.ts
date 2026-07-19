import { z } from 'zod';

import { uuid } from './common.js';

export const saveListingSchema = z.object({
  listingId: uuid,
});
export type SaveListingInput = z.infer<typeof saveListingSchema>;
