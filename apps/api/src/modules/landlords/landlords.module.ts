import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpsModule } from '../ops/ops.module';
import { AdminLandlordAccountsController } from './admin-landlord-accounts.controller';
import { LandlordsController } from './landlords.controller';
import { LandlordsRegistrationController } from './landlords-registration.controller';
import { LandlordsService } from './landlords.service';

@Module({
  imports: [AuthModule, OpsModule],
  controllers: [LandlordsController, LandlordsRegistrationController, AdminLandlordAccountsController],
  providers: [LandlordsService],
})
export class LandlordsModule {}
