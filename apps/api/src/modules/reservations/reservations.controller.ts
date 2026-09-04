import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { bookReservationSchema, releaseReservationSchema, reserveSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { ReservationsService } from './reservations.service';

class ReserveDto extends createZodDto(reserveSchema) {}
class BookDto extends createZodDto(bookReservationSchema) {}
class ReleaseDto extends createZodDto(releaseReservationSchema) {}

@Controller('reservations')
@UseGuards(AuthGuard, RolesGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('reserve')
  @Roles('student')
  reserve(@Req() req: AuthenticatedRequest, @Body() body: ReserveDto) {
    return this.reservationsService.reserve(rlsCtx(req), body);
  }

  @Post('book')
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  book(@Req() req: AuthenticatedRequest, @Body() body: BookDto) {
    return this.reservationsService.book(rlsCtx(req), body);
  }

  @Post(':id/release')
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  release(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReleaseDto,
  ) {
    return this.reservationsService.release(rlsCtx(req), id, body);
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

  @Post(':id/cancel')
  @Roles('student')
  cancel(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.cancel(rlsCtx(req), id);
  }

  @Post(':id/move-in')
  @Roles('student', 'landlord', 'custodian')
  confirmMoveIn(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.confirmMoveIn(rlsCtx(req), id);
  }
}
