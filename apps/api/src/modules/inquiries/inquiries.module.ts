import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpsModule } from '../ops/ops.module';
import { AdminInquiriesController } from './admin-inquiries.controller';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';

@Module({
  imports: [AuthModule, OpsModule],
  controllers: [InquiriesController, AdminInquiriesController],
  providers: [InquiriesService],
})
export class InquiriesModule {}
