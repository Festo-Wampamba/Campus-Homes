import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { rateLandlordSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { LandlordRatingsService } from './landlord-ratings.service';

class RateLandlordDto extends createZodDto(rateLandlordSchema) {}

@Controller('landlord-ratings')
@UseGuards(AuthGuard, RolesGuard)
export class LandlordRatingsController {
  constructor(private readonly ratings: LandlordRatingsService) {}

  @Get('landlords/:landlordId/mine')
  @Roles('student')
  mine(@Req() req: AuthenticatedRequest, @Param('landlordId', ParseUUIDPipe) landlordId: string) {
    return this.ratings.mine(rlsCtx(req), landlordId);
  }

  @Post()
  @Roles('student')
  rate(@Req() req: AuthenticatedRequest, @Body() body: RateLandlordDto) {
    return this.ratings.rate(rlsCtx(req), body);
  }

  @Get('about-me')
  @Roles('landlord')
  aboutMe(@Req() req: AuthenticatedRequest) {
    return this.ratings.aboutMe(rlsCtx(req));
  }
}
