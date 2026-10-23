import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { ZodValidationPipe } from 'nestjs-zod';

import { DbModule } from './db/db.module';
import { RedisModule } from './db/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ChatModule } from './modules/chat/chat.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthController } from './modules/health/health.controller';
import { JobsModule } from './modules/jobs/jobs.module';
import { LandlordRatingsModule } from './modules/landlord-ratings/landlord-ratings.module';
import { LandlordsModule } from './modules/landlords/landlords.module';
import { LeadsModule } from './modules/leads/leads.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { ListingsModule } from './modules/listings/listings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpsModule } from './modules/ops/ops.module';
import { PresenceModule } from './modules/presence/presence.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { RoomManagementModule } from './modules/room-management/room-management.module';
import { StaffModule } from './modules/staff/staff.module';
import { SupportModule } from './modules/support/support.module';
import { TenantAgreementsModule } from './modules/tenant-agreements/tenant-agreements.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { RootController } from './root.controller';

@Module({
  imports: [
    SentryModule.forRoot(),
    DbModule,
    RedisModule,
    AuthModule,
    ListingsModule,
    LandlordsModule,
    LandlordRatingsModule,
    OpsModule,
    ProfileModule,
    FinanceModule,
    ReservationsModule,
    RoomManagementModule,
    NotificationsModule,
    ChatModule,
    JobsModule,
    UploadsModule,
    StaffModule,
    CalendarModule,
    TenantAgreementsModule,
    LeadsModule,
    InquiriesModule,
    SupportModule,
    PresenceModule,
  ],
  controllers: [HealthController, RootController],
  providers: [
    // Reports unhandled (non-HttpException) errors; no-op without SENTRY_DSN.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    // Global: every request body/query hitting a createZodDto() DTO is
    // validated against the shared schema before any handler runs.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
