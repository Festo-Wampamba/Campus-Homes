import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { forwardInquirySchema, resolveInquirySchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequireAnyPermission, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { InquiriesService } from './inquiries.service';

class ResolveInquiryDto extends createZodDto(resolveInquirySchema) {}
class ForwardInquiryDto extends createZodDto(forwardInquirySchema) {}

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

  // Static path, must be declared before the ":id" routes below or Nest
  // would try to parse "forward-targets" as a uuid param instead.
  @Get('forward-targets')
  @RequireAnyPermission('inquiries.resolve', 'inquiries.read')
  forwardTargets() {
    return this.inquiries.forwardTargets();
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

  @Post(':id/forward')
  @RequireAnyPermission('inquiries.resolve', 'inquiries.read')
  forward(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: PermissionedRequest,
    @Body() body: ForwardInquiryDto,
  ) {
    return this.inquiries.forward(rlsCtx(req), id, body);
  }
}
