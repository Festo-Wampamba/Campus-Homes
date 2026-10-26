import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { bookReservationSchema, onboardWalkInSchema, releaseReservationSchema, reserveSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { ReservationsService } from './reservations.service';

class ReserveDto extends createZodDto(reserveSchema) {}
class BookDto extends createZodDto(bookReservationSchema) {}
class OnboardWalkInDto extends createZodDto(onboardWalkInSchema) {}
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

  // Two routes, not one: someone who is both a student and a landlord must see
  // only the side of the workspace they are in, and @Roles resolves such a
  // user to whichever role is listed first.
  @Get('receipts')
  @Roles('student')
  receipts(@Req() req: AuthenticatedRequest) {
    return this.reservationsService.receipts(rlsCtx(req), 'student');
  }

  @Get('landlord-receipts')
  @Roles('landlord')
  landlordReceipts(@Req() req: AuthenticatedRequest) {
    return this.reservationsService.receipts(rlsCtx(req), 'landlord');
  }

  @Get(':id/student')
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  studentDetails(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.studentDetails(rlsCtx(req), id);
  }

  @Post('walk-in')
  @Roles('landlord', 'custodian', 'ops_lead', 'admin')
  onboardWalkIn(@Req() req: AuthenticatedRequest, @Body() body: OnboardWalkInDto) {
    return this.reservationsService.onboardWalkIn(rlsCtx(req), body);
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

  @Post(':id/request-booking')
  @Roles('student')
  requestBooking(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.requestBooking(rlsCtx(req), id);
  }

  @Post(':id/move-in')
  @Roles('student', 'landlord', 'custodian')
  confirmMoveIn(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.confirmMoveIn(rlsCtx(req), id);
  }
}
