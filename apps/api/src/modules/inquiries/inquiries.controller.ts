import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { createInquirySchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { rlsCtx } from '../auth/roles';
import { InquiriesService } from './inquiries.service';

class CreateInquiryDto extends createZodDto(createInquirySchema) {}

// Student-facing support desk. RLS (inquiries_self) scopes every query to
// the caller's own rows — no role list needed here.
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
}
