import { createZodDto } from 'nestjs-zod';

import {
  addListingPhotosSchema,
  createOpsDraftListingSchema,
  inviteLandlordSchema,
  issueStrikeSchema,
  opsKycDecisionSchema,
  publishListingSchema,
  raiseVisitCorrectionSchema,
  resolveVisitCorrectionSchema,
  scheduleVisitSchema,
  setCampusPhotoSchema,
  syncVisitSchema,
  updateOnboardingLeadSchema,
  updateUnitOperationalStatusSchema,
} from '@campushomes/shared';

export class ScheduleVisitDto extends createZodDto(scheduleVisitSchema) {}
export class SyncVisitDto extends createZodDto(syncVisitSchema) {}
export class PublishListingDto extends createZodDto(publishListingSchema) {}
export class AddListingPhotosDto extends createZodDto(addListingPhotosSchema) {}
export class IssueStrikeDto extends createZodDto(issueStrikeSchema) {}
export class OpsKycDecisionDto extends createZodDto(opsKycDecisionSchema) {}
export class SetCampusPhotoDto extends createZodDto(setCampusPhotoSchema) {}
export class CreateOpsDraftListingDto extends createZodDto(createOpsDraftListingSchema) {}
export class UpdateUnitOperationalStatusDto extends createZodDto(updateUnitOperationalStatusSchema) {}
export class UpdateLeadStatusDto extends createZodDto(updateOnboardingLeadSchema) {}
export class InviteLandlordDto extends createZodDto(inviteLandlordSchema) {}
export class RaiseVisitCorrectionDto extends createZodDto(raiseVisitCorrectionSchema) {}
export class ResolveVisitCorrectionDto extends createZodDto(resolveVisitCorrectionSchema) {}
