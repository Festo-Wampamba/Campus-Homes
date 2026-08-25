import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { resolveInquirySchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequireAnyPermission, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { InquiriesService } from './inquiries.service';

class ResolveInquiryDto extends createZodDto(resolveInquirySchema) {}

// Staff side of the support desk. inquiries is owner-scoped under RLS, so
// staff reads/writes run as service_role behind PermissionsGuard — same
// posture as /admin/activities.
@Controller('admin/inquiries')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminInquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Get()
  @RequireAnyPermission('inquiries.resolve', 'inquiries.read')
  list(@Query('status') status?: string) {
    return this.inquiries.list(status);
  }

  @Patch(':id')
  @RequirePermission('inquiries.resolve')
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: PermissionedRequest,
    @Body() body: ResolveInquiryDto,
  ) {
    const updated = await this.inquiries.resolve(id, rlsCtx(req), body);
    if (!updated) throw new NotFoundException('Inquiry not found');
    return updated;
  }
}
