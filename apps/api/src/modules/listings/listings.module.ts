import { Logger, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpsModule } from '../ops/ops.module';
import { EventsController } from './events.controller';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { PropertyRoutes, ROUTING } from './property-routes';
import { GoogleRoutes, NoRouting, type RoutingAdapter } from '../../adapters/routing.adapter';
import { loadEnv } from '../../config/env';
import { sendRoutesDailyCapEmail } from './routes-cap-email';

const logger = new Logger('ListingsModule');

@Module({
  imports: [AuthModule, NotificationsModule, OpsModule],
  controllers: [ListingsController, EventsController],
  providers: [
    ListingsService,
    PropertyRoutes,
    {
      provide: ROUTING,
      // No key: listings simply show no road distance (never a guess).
      useFactory: (): RoutingAdapter => {
        const env = loadEnv();
        if (!env.GOOGLE_ROUTES_API_KEY) return new NoRouting();
        return new GoogleRoutes(env.GOOGLE_ROUTES_API_KEY, () => {
          logger.warn('Google Routes daily cap reached; pausing route lookups until it resets');
          // Best-effort: a mailer failure must not affect the listing page.
          sendRoutesDailyCapEmail(env).catch((err: unknown) =>
            logger.error(`Routes daily-cap email failed: ${err instanceof Error ? err.message : 'unknown error'}`),
          );
        });
      },
    },
  ],
  exports: [ListingsService],
})
export class ListingsModule {}
