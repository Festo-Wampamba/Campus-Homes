import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { createInquirySchema, respondToInquirySchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { InquiriesService } from './inquiries.service';

class CreateInquiryDto extends createZodDto(createInquirySchema) {}
class RespondToInquiryDto extends createZodDto(respondToInquirySchema) {}

// Student-facing support desk + landlord enquiry inbox. RLS
// (inquiries_self_*/inquiries_landlord_*) scopes every query to the
// caller's own rows, so no per-route role list is needed for create/mine —
// only the landlord routes below are role-gated (RolesGuard runs after the
// class-level AuthGuard, so req.session is already populated).
@Controller('inquiries')
@UseGuards(AuthGuard)
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateInquiryDto) {
    return this.inquiries.create(rlsCtx(req), body);
  }

  @Get('mine')
  mine(@Req() req: AuthenticatedRequest) {
    return this.inquiries.mine(rlsCtx(req));
  }

  @Get('landlord-inbox')
  @UseGuards(RolesGuard)
  @Roles('landlord')
  landlordInbox(@Req() req: AuthenticatedRequest) {
    return this.inquiries.landlordMine(rlsCtx(req));
  }

  @Patch(':id/respond')
  @UseGuards(RolesGuard)
  @Roles('landlord')
  respond(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RespondToInquiryDto,
  ) {
    return this.inquiries.respond(rlsCtx(req), id, body);
  }
}
