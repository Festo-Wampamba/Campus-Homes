import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenantAgreementsController } from './tenant-agreements.controller';
import { TenantAgreementsService } from './tenant-agreements.service';

@Module({
  imports: [AuthModule],
  controllers: [TenantAgreementsController],
  providers: [TenantAgreementsService],
})
export class TenantAgreementsModule {}
