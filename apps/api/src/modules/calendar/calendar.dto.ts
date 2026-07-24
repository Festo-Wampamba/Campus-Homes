import { createZodDto } from 'nestjs-zod';

import { createCalendarEventSchema, updateCalendarEventSchema } from '@campushomes/shared';

export class CreateCalendarEventDto extends createZodDto(createCalendarEventSchema) {}
export class UpdateCalendarEventDto extends createZodDto(updateCalendarEventSchema) {}
