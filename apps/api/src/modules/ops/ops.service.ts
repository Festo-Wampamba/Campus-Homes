import crypto from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

import type {
  IssueStrikeInput,
  PublishListingInput,
  ScheduleVisitInput,
  SyncVisitInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import {
  landlordStrikes,
  listingVersions,
  listings,
  opsStaff,
  semesters,
  units,
  users,
  verificationVisits,
} from '../../db/schema';
import { AuditService } from './audit.service';

@Injectable()
export class OpsService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  /** Verification queue: properties whose latest visit is still pending (or
   * that have no visit yet), with SLA age. Ops-only read. */
  queue(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const res = await client.query(
        `SELECT p.id, p.name, p.street_address, p.status, p.created_at,
                v.id AS visit_id, v.result, v.scheduled_at, v.inspector_id,
                EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 AS age_hours
         FROM properties p
         LEFT JOIN LATERAL (
           SELECT * FROM verification_visits vv
           WHERE vv.property_id = p.id
           ORDER BY vv.created_at DESC LIMIT 1
         ) v ON true
         WHERE v.id IS NULL OR v.result = 'pending'
         ORDER BY p.created_at ASC`,
      );
      return res.rows as unknown[];
    });
  }

  /** Inspector picker for the schedule-visit form. Ops-lead-only read. */
  listInspectors(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (db) =>
      db
        .select({ id: users.id, name: users.name, catchment: opsStaff.assignedCatchment })
        .from(opsStaff)
        .innerJoin(users, eq(opsStaff.userId, users.id))
        .where(and(eq(opsStaff.team, 'inspector'), eq(opsStaff.active, true))),
    );
  }

  /** An inspector's own assigned, not-yet-approved visits — their Inspection
   * Mode home screen. Not reusing queue(): that's property-shaped for leads,
   * and RLS-scoping verification_visits to the caller means a property
   * assigned to a *different* inspector would show as "no visit yet" here. */
  myVisits(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const res = await client.query(
        `SELECT vv.id AS visit_id, vv.property_id, vv.scheduled_at, vv.result,
                p.name AS property_name, p.street_address
         FROM verification_visits vv
         JOIN properties p ON p.id = vv.property_id
         WHERE vv.inspector_id = $1 AND vv.approved_at IS NULL
         ORDER BY vv.scheduled_at ASC NULLS LAST`,
        [ctx.userId],
      );
      return res.rows as unknown[];
    });
  }

  /** Full visit record for the lead's review-before-approve screen. */
  async visitDetail(ctx: RlsContext, visitId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const visit = await db.query.verificationVisits.findFirst({
        where: eq(verificationVisits.id, visitId),
      });
      if (!visit) {
        throw new NotFoundException('Visit not found');
      }
      return visit;
    });
  }

  /** Links an approved visit's property to the listing it should publish —
   * publishListingSchema takes a listingId, not a propertyId. A property can
   * carry one listing per semester (re-verification), so this excludes
   * already-verified listings from prior semesters and orders newest-first —
   * the caller (visit-approval UI) always wants the current pending one, not
   * an arbitrary row. */
  propertyListings(ctx: RlsContext, propertyId: string) {
    return this.rlsDb.run(ctx, async (db) =>
      db
        .select({ id: listings.id, status: listings.status, semesterId: listings.semesterId })
        .from(listings)
        .where(and(eq(listings.propertyId, propertyId), ne(listings.status, 'verified')))
        .orderBy(desc(listings.createdAt)),
    );
  }

  async scheduleVisit(ctx: RlsContext, input: ScheduleVisitInput) {
    const visit = await this.rlsDb.run(ctx, async (db) =>
      firstRow(
        await db
          .insert(verificationVisits)
          .values({
            propertyId: input.propertyId,
            inspectorId: input.inspectorId,
            scheduledAt: new Date(input.scheduledAt),
            // Server-created rows still need the NOT NULL idempotency slot; the
            // inspector's offline sync replaces it with the client's own key.
            clientIdempotencyKey: `visit-scheduled-${crypto.randomUUID()}`,
          })
          .returning(),
      ),
    );
    await this.audit.record(ctx, 'visit.schedule', 'verification_visit', visit.id, {
      propertyId: input.propertyId,
      inspectorId: input.inspectorId,
    });
    return visit;
  }

  /** Offline-sync endpoint (§9 flow 2). Idempotent: a retried sync with the
   * same client key returns the already-applied visit unchanged. */
  async syncVisit(ctx: RlsContext, input: SyncVisitInput) {
    const visit = await this.rlsDb.run(ctx, async (db) => {
      const existing = await db.query.verificationVisits.findFirst({
        where: eq(verificationVisits.clientIdempotencyKey, input.clientIdempotencyKey),
      });
      if (existing) {
        return existing; // replayed sync — no double-submit
      }
      const [row] = await db
        .update(verificationVisits)
        .set({
          checklist: input.checklist,
          visitGpsLat: String(input.visitGpsLat),
          visitGpsLon: String(input.visitGpsLon),
          startedAt: new Date(input.startedAt),
          completedAt: new Date(input.completedAt),
          result: input.result,
          failureReason: input.failureReason,
          clientIdempotencyKey: input.clientIdempotencyKey,
        })
        .where(eq(verificationVisits.id, input.visitId))
        .returning();
      if (!row) {
        throw new NotFoundException('Visit not found or not yours');
      }
      return row;
    });
    await this.audit.record(ctx, 'visit.sync', 'verification_visit', visit.id, {
      result: visit.result,
      clientIdempotencyKey: input.clientIdempotencyKey,
    });
    return visit;
  }

  async approveVisit(ctx: RlsContext, visitId: string) {
    const visit = await this.rlsDb.run(ctx, async (db) => {
      const [row] = await db
        .update(verificationVisits)
        .set({ approvedBy: ctx.userId, approvedAt: new Date() })
        .where(eq(verificationVisits.id, visitId))
        .returning();
      if (!row) {
        throw new NotFoundException('Visit not found');
      }
      return row;
    });
    await this.audit.record(ctx, 'visit.approve', 'verification_visit', visitId, {
      result: visit.result,
    });
    return visit;
  }

  /** Listing publish (§9 flow 3): one transaction inserts the immutable
   * version snapshot, points the listing at it and flips status to verified.
   * The 6-component DB trigger independently guards the flip. */
  async publishListing(ctx: RlsContext, input: PublishListingInput) {
    const published = await this.rlsDb.run(ctx, async (db) => {
      const listing = await db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
      });
      if (!listing) {
        throw new NotFoundException('Listing not found');
      }
      if (listing.status === 'verified') {
        throw new ConflictException('Listing is already verified');
      }
      const [{ next }] = (
        await db.execute(
          sql`SELECT COALESCE(MAX(version_number), 0) + 1 AS next
              FROM listing_versions WHERE listing_id = ${input.listingId}`,
        )
      ).rows as [{ next: number }];

      const version = firstRow(
        await db
        .insert(listingVersions)
        .values({
          listingId: input.listingId,
          versionNumber: Number(next),
          pricePerTermUgx: input.pricePerTermUgx,
          amenities: input.amenities,
          description: input.description,
          verifiedAt: new Date(),
          verifiedBy: ctx.userId,
        })
        .returning(),
      );

      const [semester] = await db
        .select()
        .from(semesters)
        .where(eq(semesters.id, listing.semesterId));

      const updated = firstRow(
        await db
        .update(listings)
        .set({
          status: 'verified',
          currentVersionId: version.id,
          verifiedAt: new Date(),
          expiresAt: semester ? new Date(`${semester.endsOn}T23:59:59Z`) : null,
        })
        .where(eq(listings.id, input.listingId))
        .returning(),
      );

      if (input.units.length > 0) {
        await db.insert(units).values(
          input.units.map((u) => ({
            listingId: input.listingId,
            label: u.label,
            capacity: u.capacity,
            availableForSemesterId: listing.semesterId,
          })),
        );
      }
      return { listing: updated, version };
    });
    await this.audit.record(ctx, 'listing.publish', 'listing', input.listingId, {
      versionId: published.version.id,
      priceUgx: input.pricePerTermUgx,
    });
    return published;
  }

  async issueStrike(ctx: RlsContext, input: IssueStrikeInput) {
    const strike = await this.rlsDb.run(ctx, async (db) =>
      firstRow(
        await db
          .insert(landlordStrikes)
          .values({
            landlordId: input.landlordId,
            reason: input.reason,
            reservationId: input.reservationId,
            description: input.notes ?? input.reason,
            issuedBy: ctx.userId,
          })
          .returning(),
      ),
    );
    await this.audit.record(ctx, 'landlord.strike', 'landlord', input.landlordId, {
      strikeId: strike.id,
      reason: input.reason,
    });
    return strike;
  }
}
