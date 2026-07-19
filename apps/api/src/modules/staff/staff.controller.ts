import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { grantRoleSchema, inviteStaffSchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { StaffService } from './staff.service';

class InviteStaffDto extends createZodDto(inviteStaffSchema) {}
class GrantRoleDto extends createZodDto(grantRoleSchema) {}

@Controller('admin/staff')
@UseGuards(AuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post('invite')
  @RequirePermission('staff.invite')
  invite(@Req() req: PermissionedRequest, @Body() body: InviteStaffDto) {
    return this.staffService.invite(rlsCtx(req), req.permissions, req.assignments, body);
  }

  @Get()
  @RequirePermission('staff.read')
  list() {
    return this.staffService.list();
  }

  @Patch(':id/deactivate')
  @RequirePermission('staff.deactivate')
  deactivate(@Req() req: PermissionedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.deactivate(rlsCtx(req), req.assignments, id);
  }

  @Post(':id/roles')
  @RequirePermission('roles.assign')
  assignRole(@Req() req: PermissionedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: GrantRoleDto) {
    return this.staffService.grantRole(rlsCtx(req), req.permissions, req.assignments, id, body);
  }

  @Delete(':id/roles/:assignmentId')
  @RequirePermission('roles.revoke')
  revokeRole(@Req() req: PermissionedRequest, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.staffService.revokeRole(rlsCtx(req), req.assignments, assignmentId);
  }
}
