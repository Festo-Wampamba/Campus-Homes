import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import {
  FlutterwavePayments,
  StubPayments,
  type PaymentsAdapter,
} from '../../adapters/payments.adapter';
import { loadEnv } from '../../config/env';
import { REDIS } from '../../db/redis.module';
import { AuthModule } from '../auth/auth.module';
import { OpsModule } from '../ops/ops.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { HOLD_EXPIRY_QUEUE, HOLD_EXPIRY_QUEUE_NAME, PAYMENTS } from './reservations.tokens';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [AuthModule, OpsModule],
  controllers: [ReservationsController, WebhookController],
  providers: [
    ReservationsService,
    {
      provide: PAYMENTS,
      useFactory: (): PaymentsAdapter => {
        const env = loadEnv();
        if (env.FLUTTERWAVE_SECRET_KEY) {
          return new FlutterwavePayments(env.FLUTTERWAVE_SECRET_KEY);
        }
        if (env.NODE_ENV === 'production') {
          throw new Error('ReservationsModule requires FLUTTERWAVE_SECRET_KEY in production');
        }
        return new StubPayments(env.WEB_ORIGIN);
      },
    },
    {
      provide: HOLD_EXPIRY_QUEUE,
      inject: [{ token: REDIS, optional: true }],
      useFactory: (redis: Redis | null): Queue | null =>
        redis ? new Queue(HOLD_EXPIRY_QUEUE_NAME, { connection: redis }) : null,
    },
  ],
  exports: [ReservationsService, PAYMENTS],
})
export class ReservationsModule {}
