import {
  Inject,
  Injectable,
  Logger,
  Module,
  Optional,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import { RlsDb } from '../../db/db.module';
import { REDIS } from '../../db/redis.module';
import { reservations } from '../../db/schema';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { RESERVATION_EXPIRY_QUEUE_NAME } from '../reservations/reservations.tokens';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MAINTENANCE_QUEUE = 'maintenance';

/** In-process BullMQ workers (§11) — same deployable as the API by design. */
@Injectable()
export class JobsRunner implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobsRunner.name);
  private workers: Worker[] = [];
  private maintenanceQueue: Queue | null = null;

  constructor(
    private readonly rlsDb: RlsDb,
    private readonly notifications: NotificationsService,
    @Optional() @Inject(REDIS) private readonly redis: Redis | null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redis) {
      this.logger.warn('REDIS_URL unset — background jobs disabled');
      return;
    }
    const connection = this.redis;

    // reservation_expiry: fired per-reservation at reserved_expires_at (§11).
    this.workers.push(
      new Worker(
        RESERVATION_EXPIRY_QUEUE_NAME,
        async (job) => this.expireReservation((job.data as { reservationId: string }).reservationId),
        { connection },
      ),
    );

    // Hourly/daily sweeps share one repeatable queue.
    this.maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection });
    await this.maintenanceQueue.upsertJobScheduler('verification_sla_alert', {
      every: 3600_000, // hourly
    });
    await this.maintenanceQueue.upsertJobScheduler('semester_reverify_rollover', {
      every: 24 * 3600_000, // daily
    });
    this.workers.push(
      new Worker(
        MAINTENANCE_QUEUE,
        async (job) => {
          if (job.name === 'verification_sla_alert') return this.slaAlert();
          if (job.name === 'semester_reverify_rollover') return this.reverifyRollover();
        },
        { connection },
      ),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.maintenanceQueue?.close();
  }

  /** Still Reserved past its 24h window → Expired (§11). A Booked
   * reservation never reaches this state (reservedExpiresAt is cleared the
   * moment a landlord Books it), so there's nothing to refund here — no
   * online payment was ever taken for a mere reservation. */
  async expireReservation(reservationId: string): Promise<void> {
    await this.rlsDb.run({ userId: NIL_UUID, role: 'service_role' }, async (db) => {
      const reservation = await db.query.reservations.findFirst({
        where: eq(reservations.id, reservationId),
      });
      if (!reservation || reservation.status !== 'reserved') {
        return; // already booked/cancelled — nothing to do
      }
      await db
        .update(reservations)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));
    });
    this.logger.log(`reservation_expiry processed for reservation ${reservationId}`);
  }

  /** Visits pending past 48h of their 72h SLA → SMS the assigned inspector (§11). */
  async slaAlert(): Promise<void> {
    const rows = await this.rlsDb.run(
      { userId: NIL_UUID, role: 'service_role' },
      async (_db, client) => {
        const res = await client.query(
          `SELECT v.id, v.inspector_id, p.name
           FROM verification_visits v
           JOIN properties p ON p.id = v.property_id
           WHERE v.result = 'pending'
             AND v.created_at < now() - interval '48 hours'
             AND v.created_at > now() - interval '72 hours'`,
        );
        return res.rows as { id: string; inspector_id: string; name: string }[];
      },
    );
    for (const visit of rows) {
      await this.notifications.notify(visit.inspector_id, 'ops.visit_sla_alert', 'sms', {
        visitId: visit.id,
        message: `CampusHomes: verification visit for "${visit.name}" is nearing its 72h SLA.`,
      });
    }
  }

  /** Listings expiring within 7 days → notify the landlord to re-verify (§11). */
  async reverifyRollover(): Promise<void> {
    const rows = await this.rlsDb.run(
      { userId: NIL_UUID, role: 'service_role' },
      async (_db, client) => {
        const res = await client.query(
          `SELECT l.id, p.landlord_id, p.name
           FROM listings l
           JOIN properties p ON p.id = l.property_id
           WHERE l.status = 'verified'
             AND l.expires_at IS NOT NULL
             AND l.expires_at BETWEEN now() AND now() + interval '7 days'`,
        );
        return res.rows as { id: string; landlord_id: string; name: string }[];
      },
    );
    for (const listing of rows) {
      await this.notifications.notify(listing.landlord_id, 'listing.reverify_reminder', 'sms', {
        listingId: listing.id,
        message: `CampusHomes: your listing for "${listing.name}" expires soon — book re-verification.`,
      });
    }
  }
}

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [JobsRunner],
})
export class JobsModule {}
