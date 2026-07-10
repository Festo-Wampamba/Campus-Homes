import { createZodDto } from 'nestjs-zod';

import { upsertLandlordProfileSchema } from '@campushomes/shared';

export class UpsertLandlordProfileDto extends createZodDto(upsertLandlordProfileSchema) {}
