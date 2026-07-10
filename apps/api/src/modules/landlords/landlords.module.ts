import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LandlordsController } from './landlords.controller';
import { LandlordsService } from './landlords.service';

@Module({
  imports: [AuthModule],
  controllers: [LandlordsController],
  providers: [LandlordsService],
})
export class LandlordsModule {}
