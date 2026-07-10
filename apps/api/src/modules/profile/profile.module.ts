import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProfileController } from './profile.controller';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController],
})
export class ProfileModule {}
