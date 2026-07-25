import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { RlsDb } from '../../db/db.module';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { updateSelfParticulars } from '../profile/particulars';
import { UpdateSelfParticularsDto, UpsertLandlordProfileDto } from './landlords.dto';
import { LandlordsService } from './landlords.service';

@Controller('landlords')
@UseGuards(AuthGuard, RolesGuard)
export class LandlordsController {
  constructor(
    private readonly landlords: LandlordsService,
    private readonly rlsDb: RlsDb,
  ) {}

  // Student -> landlord role flip (the onboarding wizard's INSERT then works
  // under RLS's own landlords_self_insert policy, no further service path
  // needed).
  @Post('apply')
  @Roles('student')
  apply(@Req() req: AuthenticatedRequest) {
    return this.landlords.apply(rlsCtx(req));
  }

  @Get('me')
  @Roles('landlord')
  me(@Req() req: AuthenticatedRequest) {
    return this.landlords.me(rlsCtx(req));
  }

  @Post('profile')
  @Roles('landlord')
  upsertProfile(@Req() req: AuthenticatedRequest, @Body() body: UpsertLandlordProfileDto) {
    return this.landlords.upsertProfile(rlsCtx(req), body);
  }

  @Patch('particulars')
  @Roles('landlord')
  updateParticulars(@Req() req: AuthenticatedRequest, @Body() body: UpdateSelfParticularsDto) {
    return updateSelfParticulars(this.rlsDb, rlsCtx(req), body);
  }
}
