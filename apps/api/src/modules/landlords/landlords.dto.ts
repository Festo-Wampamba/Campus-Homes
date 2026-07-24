import { createZodDto } from 'nestjs-zod';

import { updateSelfParticularsSchema, upsertLandlordProfileSchema } from '@campushomes/shared';

export class UpsertLandlordProfileDto extends createZodDto(upsertLandlordProfileSchema) {}
export class UpdateSelfParticularsDto extends createZodDto(updateSelfParticularsSchema) {}
