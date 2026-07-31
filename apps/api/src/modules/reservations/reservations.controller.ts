import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { createHoldSchema } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import { assertPaymentsEnabled } from '../../config/payment-guard';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { ReservationsService } from './reservations.service';

class CreateHoldDto extends createZodDto(createHoldSchema) {}

@Controller('reservations')
@UseGuards(AuthGuard, RolesGuard)
export class ReservationsController {
  private readonly env = loadEnv();
  private readonly redirectUrl = this.env.PAYMENT_REDIRECT_URL;

  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('holds')
  @Roles('student')
  createHold(@Req() req: AuthenticatedRequest, @Body() body: CreateHoldDto) {
    assertPaymentsEnabled(this.env);
    return this.reservationsService.createHold(rlsCtx(req), body, this.redirectUrl);
  }

  @Get('mine')
  @Roles('student')
  mine(@Req() req: AuthenticatedRequest) {
    return this.reservationsService.mine(rlsCtx(req));
  }

  @Get('landlord-inbox')
  @Roles('landlord')
  landlordInbox(@Req() req: AuthenticatedRequest) {
    return this.reservationsService.landlordInbox(rlsCtx(req));
  }

  @Get(':id/payment-status')
  @Roles('student')
  paymentStatus(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.paymentStatus(rlsCtx(req), id);
  }

  @Post(':id/cancel')
  @Roles('student')
  cancel(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.cancel(rlsCtx(req), id);
  }

  @Post(':id/move-in')
  @Roles('student', 'landlord')
  confirmMoveIn(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.confirmMoveIn(rlsCtx(req), id);
  }
}
