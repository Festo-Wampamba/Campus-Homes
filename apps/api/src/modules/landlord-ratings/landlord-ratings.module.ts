import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LandlordRatingsController } from './landlord-ratings.controller';
import { LandlordRatingsService } from './landlord-ratings.service';

@Module({
  imports: [AuthModule],
  controllers: [LandlordRatingsController],
  providers: [LandlordRatingsService],
})
export class LandlordRatingsModule {}
