import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { registerPushSubscriptionSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { rlsCtx } from '../auth/roles';
import { NotificationsService } from './notifications.service';

class RegisterPushSubscriptionDto extends createZodDto(registerPushSubscriptionSchema) {}

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  feed(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.feed(rlsCtx(req));
  }

  @Post('push-subscriptions')
  registerPush(@Req() req: AuthenticatedRequest, @Body() body: RegisterPushSubscriptionDto) {
    return this.notificationsService.registerPushSubscription(rlsCtx(req), body);
  }

  @Post(':id/read')
  markRead(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(rlsCtx(req), id);
  }
}
