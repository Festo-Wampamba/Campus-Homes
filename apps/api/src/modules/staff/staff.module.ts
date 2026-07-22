import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpsModule } from '../ops/ops.module';
import { AuditLogController } from './audit-log.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminPropertiesController } from './admin-properties.controller';
import { AdminPropertiesService } from './admin-properties.service';
import { AdminConfigController } from './admin-config.controller';
import { AdminConfigService } from './admin-config.service';
import { AdminExportsController } from './admin-exports.controller';
import { AdminExportsService } from './admin-exports.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [AuthModule, OpsModule],
  controllers: [
    StaffController,
    AuditLogController,
    AdminDashboardController,
    AdminUsersController,
    AdminPropertiesController,
    AdminConfigController,
    AdminExportsController,
  ],
  providers: [
    StaffService,
    AdminDashboardService,
    AdminUsersService,
    AdminPropertiesService,
    AdminConfigService,
    AdminExportsService,
  ],
})
export class StaffModule {}
