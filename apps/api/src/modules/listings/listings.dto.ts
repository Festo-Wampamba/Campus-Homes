import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  listingSearchSchema,
  submitPropertySchema,
  updatePropertySchema,
  uuid as uuidSchema,
} from '@campushomes/shared';
import { DOC_TYPES } from '@campushomes/shared';

export class SubmitPropertyDto extends createZodDto(submitPropertySchema) {}

export class UpdatePropertyDto extends createZodDto(updatePropertySchema) {}

export class ListingSearchDto extends createZodDto(listingSearchSchema) {}

export class AddPropertyDocumentDto extends createZodDto(
  z.object({
    docType: z.enum(DOC_TYPES),
    storageKey: z.string().min(1).max(500),
  }),
) {}

export class CreateDraftListingDto extends createZodDto(
  z.object({
    propertyId: uuidSchema,
    semesterId: uuidSchema,
  }),
) {}

export class AddUnitPhotoDto extends createZodDto(
  z.object({
    storageKey: z.string().min(1).max(500),
  }),
) {}
