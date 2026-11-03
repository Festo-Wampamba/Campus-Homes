import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { propertyTeamAssignmentSchema } from '@campushomes/shared';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { Roles, RolesGuard, rlsCtx } from '../auth/roles';
import { PropertyTeamService } from './property-team.service';

class AssignmentDto extends createZodDto(propertyTeamAssignmentSchema) {}

@Controller('property-team')
@UseGuards(AuthGuard, RolesGuard)
export class PropertyTeamController {
  constructor(private readonly team: PropertyTeamService) {}
  @Get() @Roles('landlord') owner(@Req() req: AuthenticatedRequest) { return this.team.owner(rlsCtx(req)); }
  @Get('mine') @Roles('custodian', 'property_worker') mine(@Req() req: AuthenticatedRequest) { return this.team.mine(rlsCtx(req)); }
  @Post('assignments') @Roles('landlord') assign(@Req() req: AuthenticatedRequest, @Body() body: AssignmentDto) {
    return this.team.assign(rlsCtx(req), body);
  }
  @Delete('memberships/:id') @Roles('landlord') revoke(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.team.revoke(rlsCtx(req), id);
  }
}
