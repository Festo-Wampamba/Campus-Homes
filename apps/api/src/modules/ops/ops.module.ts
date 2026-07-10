import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [AuthModule],
  controllers: [OpsController],
  providers: [OpsService, AuditService],
  exports: [AuditService],
})
export class OpsModule {}
