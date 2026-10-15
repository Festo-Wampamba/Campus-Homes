import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { supportAskSchema, type SupportAskResponse } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import { askSupportAssistant } from './support-assistant';

class SupportAskDto extends createZodDto(supportAskSchema) {}

// Public on purpose: the support page is public. Abuse is bounded by the
// support-ai rate limit in main.ts and the schema's message caps.
@Controller('support')
export class SupportController {
  @Post('ask')
  @HttpCode(200)
  async ask(@Body() dto: SupportAskDto): Promise<SupportAskResponse> {
    return { reply: await askSupportAssistant(loadEnv(), dto.messages) };
  }
}
