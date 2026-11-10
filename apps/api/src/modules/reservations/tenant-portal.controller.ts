import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { issueTenancyClaimSchema, redeemTenancyClaimSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { TenantPortalService } from './tenant-portal.service';

class IssueTenancyClaimDto extends createZodDto(issueTenancyClaimSchema) {}
class RedeemTenancyClaimDto extends createZodDto(redeemTenancyClaimSchema) {}

@Controller('tenant-portal')
@UseGuards(AuthGuard, RolesGuard)
export class TenantPortalController {
  constructor(private readonly portal: TenantPortalService) {}

  @Post('invites')
  @Roles('landlord')
  issue(@Req() req: AuthenticatedRequest, @Body() body: IssueTenancyClaimDto) {
    return this.portal.issue(rlsCtx(req), body.reservationId);
  }

  @Post('invites/revoke')
  @HttpCode(200)
  @Roles('landlord')
  revoke(@Req() req: AuthenticatedRequest, @Body() body: IssueTenancyClaimDto) {
    return this.portal.revoke(rlsCtx(req), body.reservationId);
  }

  @Post('claims')
  @HttpCode(200)
  @Roles('student')
  redeem(@Req() req: AuthenticatedRequest, @Body() body: RedeemTenancyClaimDto) {
    return this.portal.redeem(rlsCtx(req), body.code);
  }
}
