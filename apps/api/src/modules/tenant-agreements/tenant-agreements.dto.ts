import { createZodDto } from 'nestjs-zod';

import { saveTenantAgreementTemplateSchema, submitTenantAgreementSchema } from '@campushomes/shared';

export class SaveTenantAgreementTemplateDto extends createZodDto(saveTenantAgreementTemplateSchema) {}
export class SubmitTenantAgreementDto extends createZodDto(submitTenantAgreementSchema) {}
