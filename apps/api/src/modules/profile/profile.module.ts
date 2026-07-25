import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';
import { MeController } from './me.controller';
import { ProfileController } from './profile.controller';

@Module({
  imports: [AuthModule, ListingsModule],
  controllers: [ProfileController, MeController],
})
export class ProfileModule {}
