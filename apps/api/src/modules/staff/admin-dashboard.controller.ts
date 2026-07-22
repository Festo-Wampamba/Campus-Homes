import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { updateRolePermissionsSchema } from '@campushomes/shared';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequireAnyPermission, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { AdminDashboardService } from './admin-dashboard.service';

class UpdateRolePermissionsDto extends createZodDto(updateRolePermissionsSchema) {}

@Controller('admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('access/me')
  access(@Req() req: AuthenticatedRequest) {
    return this.dashboard.access(req.session.user.id);
  }

  @Get('overview')
  @RequirePermission('analytics.read')
  overview() { return this.dashboard.overview(); }

  @Get('users')
  @RequireAnyPermission('students.read', 'landlords.read', 'staff.read')
  users(@Req() req: PermissionedRequest) { return this.dashboard.users(req.permissions); }

  @Get('properties')
  @RequirePermission('properties.read')
  properties() { return this.dashboard.properties(); }

  @Get('verifications')
  @RequireAnyPermission('visits.read', 'landlords.read')
  verifications(@Req() req: PermissionedRequest) { return this.dashboard.verifications(req.permissions); }

  @Get('reservations')
  @RequirePermission('reservations.read')
  reservations() { return this.dashboard.reservations(); }

  @Get('payments')
  @RequirePermission('payments.read')
  payments() { return this.dashboard.payments(); }

  @Get('cases')
  @RequireAnyPermission('disputes.read', 'refunds.read', 'strikes.read')
  cases(@Req() req: PermissionedRequest) { return this.dashboard.cases(req.permissions); }

  @Get('reports')
  @RequirePermission('analytics.read')
  reports() { return this.dashboard.reports(); }

  @Get('settings')
  @RequirePermission('semesters.manage')
  settings() { return this.dashboard.settings(); }

  @Get('integrations')
  @RequirePermission('integrations.read')
  integrations() { return this.dashboard.integrations(); }

  @Get('roles')
  @RequirePermission('roles.read')
  roles() { return this.dashboard.roles(); }

  @Get('roles/:key')
  @RequirePermission('roles.read')
  role(@Param('key') key: string) { return this.dashboard.role(key); }

  @Patch('roles/:key/permissions')
  @RequirePermission('settings.manage')
  updateRolePermissions(
    @Req() req: PermissionedRequest,
    @Param('key') key: string,
    @Body() body: UpdateRolePermissionsDto,
  ) {
    return this.dashboard.updateRolePermissions(rlsCtx(req), key, body);
  }

  @Get('audit')
  @RequirePermission('audit.read')
  audit() { return this.dashboard.auditLog(); }
}
