import { createZodDto } from 'nestjs-zod';

import { createOnboardingLeadSchema } from '@campushomes/shared';

export class CreateOnboardingLeadDto extends createZodDto(createOnboardingLeadSchema) {}
