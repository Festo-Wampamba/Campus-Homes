import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { typingSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RolesGuard, rlsCtx } from '../auth/roles';
import { PresenceService } from './presence.service';

class TypingDto extends createZodDto(typingSchema) {}

// Frequent by design (every 25 s per visible tab, every few seconds while
// typing), so main.ts gives /presence its own rate-limit bucket.
@Controller('presence')
@UseGuards(AuthGuard, RolesGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('heartbeat')
  @HttpCode(204)
  async heartbeat(@Req() req: AuthenticatedRequest) {
    await this.presence.heartbeat(rlsCtx(req).userId);
  }

  @Post('away')
  @HttpCode(204)
  async away(@Req() req: AuthenticatedRequest) {
    await this.presence.away(rlsCtx(req).userId);
  }

  @Post('typing')
  @HttpCode(204)
  async typing(@Req() req: AuthenticatedRequest, @Body() body: TypingDto) {
    await this.presence.typing(rlsCtx(req).userId, body.threadId);
  }
}
