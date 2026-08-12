import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

import { DbModule } from './db/db.module';
import { RedisModule } from './db/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ChatModule } from './modules/chat/chat.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthController } from './modules/health/health.controller';
import { JobsModule } from './modules/jobs/jobs.module';
import { LandlordsModule } from './modules/landlords/landlords.module';
import { ListingsModule } from './modules/listings/listings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpsModule } from './modules/ops/ops.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { StaffModule } from './modules/staff/staff.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { RootController } from './root.controller';

@Module({
  imports: [
    DbModule,
    RedisModule,
    AuthModule,
    ListingsModule,
    LandlordsModule,
    OpsModule,
    ProfileModule,
    FinanceModule,
    ReservationsModule,
    NotificationsModule,
    ChatModule,
    JobsModule,
    UploadsModule,
    StaffModule,
    CalendarModule,
  ],
  controllers: [HealthController, RootController],
  providers: [
    // Global: every request body/query hitting a createZodDto() DTO is
    // validated against the shared schema before any handler runs.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
