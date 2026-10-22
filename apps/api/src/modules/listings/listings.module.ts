import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsController } from './events.controller';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { PropertyRoutes, ROUTING } from './property-routes';
import { GoogleRoutes, NoRouting, type RoutingAdapter } from '../../adapters/routing.adapter';
import { loadEnv } from '../../config/env';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ListingsController, EventsController],
  providers: [
    ListingsService,
    PropertyRoutes,
    {
      provide: ROUTING,
      // No key: listings simply show no road distance (never a guess).
      useFactory: (): RoutingAdapter => {
        const key = loadEnv().GOOGLE_ROUTES_API_KEY;
        return key ? new GoogleRoutes(key) : new NoRouting();
      },
    },
  ],
  exports: [ListingsService],
})
export class ListingsModule {}
