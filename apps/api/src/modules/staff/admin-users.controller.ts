import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import {
  adminPermissionGrantSchema,
  adminRoleAssignmentSchema,
  createAdminUserSchema,
  deleteAdminUserSchema,
  updateAdminUserSchema,
} from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import {
  PermissionedRequest,
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { AdminUsersService } from './admin-users.service';

class CreateAdminUserDto extends createZodDto(createAdminUserSchema) {}
class UpdateAdminUserDto extends createZodDto(updateAdminUserSchema) {}
class DeleteAdminUserDto extends createZodDto(deleteAdminUserSchema) {}
class AdminRoleAssignmentDto extends createZodDto(adminRoleAssignmentSchema) {}
class AdminPermissionGrantDto extends createZodDto(adminPermissionGrantSchema) {}

@Controller('admin/users')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Post()
  @RequirePermission('users.create')
  create(@Req() req: PermissionedRequest, @Body() body: CreateAdminUserDto) {
    return this.users.create(rlsCtx(req), body);
  }

  @Get(':id')
  @RequireAnyPermission('students.read', 'landlords.read', 'staff.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }

  @Patch(':id')
  @RequirePermission('users.update')
  update(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAdminUserDto,
  ) {
    return this.users.update(rlsCtx(req), id, body);
  }

  @Delete(':id')
  @RequirePermission('users.delete')
  remove(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DeleteAdminUserDto,
  ) {
    return this.users.softDelete(rlsCtx(req), req.permissions, id, body.reason);
  }

  @Post(':id/roles')
  @RequirePermission('roles.assign')
  assignRole(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminRoleAssignmentDto,
  ) {
    return this.users.assignRole(rlsCtx(req), req.permissions, id, body);
  }

  @Delete(':id/roles/:assignmentId')
  @RequirePermission('roles.revoke')
  revokeRole(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.users.revokeRole(rlsCtx(req), req.permissions, id, assignmentId);
  }

  @Post(':id/permissions')
  @RequirePermission('users.permissions_manage')
  grantPermissions(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminPermissionGrantDto,
  ) {
    return this.users.grantPermissions(rlsCtx(req), req.permissions, id, body);
  }

  @Delete(':id/permissions/:grantId')
  @RequirePermission('users.permissions_manage')
  revokePermission(
    @Req() req: PermissionedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    return this.users.revokePermission(rlsCtx(req), id, grantId);
  }
}
