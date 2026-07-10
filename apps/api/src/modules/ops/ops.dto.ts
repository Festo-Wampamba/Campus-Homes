import { createZodDto } from 'nestjs-zod';

import {
  issueStrikeSchema,
  publishListingSchema,
  scheduleVisitSchema,
  syncVisitSchema,
} from '@campushomes/shared';

export class ScheduleVisitDto extends createZodDto(scheduleVisitSchema) {}
export class SyncVisitDto extends createZodDto(syncVisitSchema) {}
export class PublishListingDto extends createZodDto(publishListingSchema) {}
export class IssueStrikeDto extends createZodDto(issueStrikeSchema) {}
