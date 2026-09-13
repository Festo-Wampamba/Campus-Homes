import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { pusherAuthSchema, sendMessageSchema, startConversationSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { ChatService } from './chat.service';

class SendMessageDto extends createZodDto(sendMessageSchema) {}
class PusherAuthDto extends createZodDto(pusherAuthSchema) {}
class StartConversationDto extends createZodDto(startConversationSchema) {}

@Controller('chat')
@UseGuards(AuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('threads')
  myThreads(@Req() req: AuthenticatedRequest) {
    return this.chat.myThreads(rlsCtx(req));
  }

  @Get('contacts')
  @Roles('student', 'landlord')
  contacts(@Req() req: AuthenticatedRequest) {
    return this.chat.contacts(rlsCtx(req));
  }

  @Post('direct-threads')
  @Roles('student', 'landlord')
  ensureDirectThread(@Req() req: AuthenticatedRequest, @Body() body: StartConversationDto) {
    return this.chat.ensureDirectThread(rlsCtx(req), body.recipientUserId);
  }

  @Post('threads/:reservationId')
  @Roles('student', 'landlord')
  ensureThread(
    @Req() req: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ) {
    return this.chat.ensureThread(rlsCtx(req), reservationId);
  }

  @Get('threads/:id/messages')
  messages(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.messages(rlsCtx(req), id);
  }

  @Post('threads/:id/read')
  @Roles('student', 'landlord')
  markRead(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.markRead(rlsCtx(req), id);
  }

  @Post('threads/:id/messages')
  @Roles('student', 'landlord')
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.chat.sendMessage(rlsCtx(req), id, body.body);
  }

  @Post('threads/:threadId/messages/:messageId/edit')
  @Roles('student', 'landlord')
  editMessage(
    @Req() req: AuthenticatedRequest,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() body: SendMessageDto,
  ) {
    return this.chat.editMessage(rlsCtx(req), threadId, messageId, body.body);
  }

  @Post('pusher/auth')
  authorizePusher(@Req() req: AuthenticatedRequest, @Body() body: PusherAuthDto) {
    return this.chat.authorizeChannel(rlsCtx(req), body.socket_id, body.channel_name);
  }
}
