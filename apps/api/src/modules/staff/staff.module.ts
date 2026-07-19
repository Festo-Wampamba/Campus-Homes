import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpsModule } from '../ops/ops.module';
import { AuditLogController } from './audit-log.controller';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [AuthModule, OpsModule],
  controllers: [StaffController, AuditLogController],
  providers: [StaffService],
})
export class StaffModule {}
