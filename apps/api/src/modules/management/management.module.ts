import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessAccessController } from './business-access.controller';
import { BusinessAccessService } from './business-access.service';
import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';
@Module({
  imports: [AuthModule],
  controllers: [ManagementController, BusinessAccessController],
  providers: [ManagementService, BusinessAccessService],
})
export class ManagementModule {}
