import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsController } from './events.controller';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ListingsController, EventsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
