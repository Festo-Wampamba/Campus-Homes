import { createZodDto } from 'nestjs-zod';

import { updateLandlordContactSchema, updateSelfParticularsSchema, upsertLandlordProfileSchema } from '@campushomes/shared';

export class UpsertLandlordProfileDto extends createZodDto(upsertLandlordProfileSchema) {}
export class UpdateSelfParticularsDto extends createZodDto(updateSelfParticularsSchema) {}

export class UpdateLandlordContactDto extends createZodDto(updateLandlordContactSchema) {}
