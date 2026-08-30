import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { rejectLandlordAccountSchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { LandlordsService } from './landlords.service';

class RejectLandlordAccountDto extends createZodDto(rejectLandlordAccountSchema) {}

// Ops lead / admin review queue for self-registered landlord accounts —
// mounted once, reachable from both the ops and admin portals (same
// dual-mount pattern as /admin/inquiries): PermissionsGuard is the real
// gate, not the URL prefix. landlords.review_kyc/landlords.suspend are the
// same permissions that already gate the KYC queue — this is an earlier
// gate in the same reviewer's workflow, not a new role.
@Controller('admin/landlord-accounts')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminLandlordAccountsController {
  constructor(private readonly landlords: LandlordsService) {}

  @Get()
  @RequirePermission('landlords.review_kyc')
  pending() {
    return this.landlords.pendingAccounts();
  }

  @Post(':id/approve')
  @RequirePermission('landlords.review_kyc')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: PermissionedRequest) {
    return this.landlords.approveAccount(rlsCtx(req), id);
  }

  @Post(':id/reject')
  @RequirePermission('landlords.suspend')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: PermissionedRequest,
    @Body() body: RejectLandlordAccountDto,
  ) {
    return this.landlords.rejectAccount(rlsCtx(req), id, body);
  }
}
