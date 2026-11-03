import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessAccessController } from './business-access.controller';
import { BusinessAccessService } from './business-access.service';
import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';
import { PropertyTeamController } from './property-team.controller';
import { PropertyTeamService } from './property-team.service';
@Module({
  imports: [AuthModule],
  controllers: [ManagementController, BusinessAccessController, PropertyTeamController],
  providers: [ManagementService, BusinessAccessService, PropertyTeamService],
})
export class ManagementModule {}
