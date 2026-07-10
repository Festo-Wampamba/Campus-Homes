import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { UpsertLandlordProfileDto } from './landlords.dto';
import { LandlordsService } from './landlords.service';

@Controller('landlords')
@UseGuards(AuthGuard, RolesGuard)
@Roles('landlord')
export class LandlordsController {
  constructor(private readonly landlords: LandlordsService) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.landlords.me(rlsCtx(req));
  }

  @Post('profile')
  upsertProfile(@Req() req: AuthenticatedRequest, @Body() body: UpsertLandlordProfileDto) {
    return this.landlords.upsertProfile(rlsCtx(req), body);
  }
}
