import crypto from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

import type {
  IssueStrikeInput,
  OpsKycDecisionInput,
  PublishListingInput,
  ScheduleVisitInput,
  SyncVisitInput,
  University,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { firstRow } from '../../db/client';
import { RlsDb } from '../../db/db.module';
import {
  campusPhotos,
  landlordStrikes,
  landlords,
  listingPhotos,
  listingVersions,
  listings,
  opsStaff,
  properties,
  semesters,
  units,
  users,
  verificationVisits,
} from '../../db/schema';
import { AuditService } from './audit.service';

/** Promoting a visit's staged photos into listing_photos at publish time is
 * a system operation, not a fresh "ops uploads a photo" action — the
 * original inspector captured them, but the ops_lead publishing wasn't the
 * one who ran the upload. listing_photos_ops_insert (0001) requires
 * `captured_by = app_user_id()`, which would force mis-attributing the
 * photos to whichever lead happens to publish; service_role sidesteps that
 * so `captured_by` stays the real inspector's id. */
const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

@Injectable()
export class OpsService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  /** Verification queue: properties with no visit yet, a visit still in
   * progress, or a passed visit awaiting the lead's approval. Ops-only read.
   * A visit that's `passed` but not yet `approved_at` must stay in the queue
   * — that's the lead's own action item — so this can't just filter on
   * `result = 'pending'` alone. */
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
         WHERE v.id IS NULL
            OR v.result = 'pending'
            OR (v.result = 'passed' AND v.approved_at IS NULL)
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
          photoStorageKeys: input.photoStorageKeys,
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

  // Promotes the visit's captured GPS onto the property record — the
  // properties.gps_lat/gps_lon comment in shared says "set by Ops during
  // verification, never by the landlord", but nothing ever wrote it before
  // this; without it, properties.gps_point (the generated PostGIS column
  // student search filters on) stays null and the listing can never surface
  // in a bounding-box search no matter how it's published.
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
      if (row.visitGpsLat != null && row.visitGpsLon != null) {
        await db
          .update(properties)
          .set({ gpsLat: row.visitGpsLat, gpsLon: row.visitGpsLon })
          .where(eq(properties.id, row.propertyId));
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
   * The 6-component DB trigger independently guards the flip. Each unit
   * carries its own room-category price now — the version's headline price
   * is derived as the cheapest category, not entered directly by Ops. */
  async publishListing(ctx: RlsContext, input: PublishListingInput) {
    const startingPriceUgx = Math.min(...input.units.map((u) => u.pricePerTermUgx));
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
      // The visit whose photos (staged at sync time) get promoted below —
      // the most recently approved, passed visit for this property.
      const approvedVisit = await db.query.verificationVisits.findFirst({
        where: and(
          eq(verificationVisits.propertyId, listing.propertyId),
          eq(verificationVisits.result, 'passed'),
        ),
        orderBy: (v, ops) => [ops.desc(v.approvedAt)],
      });
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
          pricePerTermUgx: startingPriceUgx,
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

      await db.insert(units).values(
        input.units.map((u) => ({
          listingId: input.listingId,
          label: u.label,
          capacity: u.capacity,
          roomCategory: u.roomCategory,
          pricePerTermUgx: u.pricePerTermUgx,
          availableForSemesterId: listing.semesterId,
        })),
      );
      return { listing: updated, version, approvedVisit };
    });
    await this.audit.record(ctx, 'listing.publish', 'listing', input.listingId, {
      versionId: published.version.id,
      priceUgx: startingPriceUgx,
    });

    // Promote the visit's staged photos (uploaded at sync time) now that a
    // listing_version — the FK they attach to — finally exists. A visit with
    // no photos staged, or missing GPS (shouldn't happen: the inspection form
    // requires GPS before a visit can even be submitted), is skipped rather
    // than blocking the publish itself on it.
    const visit = published.approvedVisit;
    const photoKeys = (visit?.photoStorageKeys ?? []) as string[];
    const gpsLat = visit?.visitGpsLat;
    const gpsLon = visit?.visitGpsLon;
    if (visit && photoKeys.length > 0 && gpsLat != null && gpsLon != null) {
      await this.rlsDb.run(SERVICE_CTX, (db) =>
        db.insert(listingPhotos).values(
          photoKeys.map((storageKey, i) => ({
            listingVersionId: published.version.id,
            storageKey,
            capturedBy: visit.inspectorId,
            gpsLat,
            gpsLon,
            capturedAt: visit.completedAt ?? new Date(),
            isPrimary: i === 0,
            sortOrder: i,
          })),
        ),
      );
    }

    return published;
  }

  /** Listing + its property for the publish form — lets Ops pre-fill room
   * categories from the landlord's proposal instead of typing from scratch. */
  async listingForPublish(ctx: RlsContext, listingId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const listing = await db.query.listings.findFirst({
        where: eq(listings.id, listingId),
      });
      if (!listing) {
        throw new NotFoundException('Listing not found');
      }
      const [property] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, listing.propertyId));
      return { listing, property };
    });
  }

  /** Landlords awaiting KYC review, oldest first. landlords_read already
   * grants app_is_lead() a read, same as users_read — no service_role
   * needed, unlike the write below. */
  kycQueue(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const res = await client.query(
        `SELECT l.user_id, l.legal_name, l.kyc_status, l.id_doc_storage_key, l.created_at,
                u.name, u.phone, u.email
         FROM landlords l
         JOIN users u ON u.id = l.user_id
         WHERE l.kyc_status = 'pending'
         ORDER BY l.created_at ASC`,
      );
      return res.rows as unknown[];
    });
  }

  /** Approve/reject a landlord's KYC. landlords has no ops UPDATE policy
   * (only the owner's own "while pending" edit and svc_all) so this runs as
   * service_role, same as the audit trail it writes to. */
  async decideKyc(ctx: RlsContext, landlordUserId: string, input: OpsKycDecisionInput) {
    const landlord = await this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (db) => {
      const [row] = await db
        .update(landlords)
        .set({
          kycStatus: input.decision,
          kycReviewedBy: ctx.userId,
          kycReviewedAt: new Date(),
        })
        .where(eq(landlords.userId, landlordUserId))
        .returning();
      if (!row) {
        throw new NotFoundException('Landlord not found');
      }
      return row;
    });
    await this.audit.record(ctx, 'landlord.kyc_decision', 'landlord', landlordUserId, {
      decision: input.decision,
    });
    return landlord;
  }

  /** Upsert — Ops can replace a campus's landing-page photo any time.
   * Not audit-logged: audit_log.target_id is a uuid and campus_photos has no
   * uuid key to point at (its PK is the university code itself) — this is
   * decorative content, not a §17 money/strike/verification mutation. */
  setCampusPhoto(ctx: RlsContext, university: University, storageKey: string) {
    return this.rlsDb.run(ctx, async (db) =>
      firstRow(
        await db
          .insert(campusPhotos)
          .values({ university, storageKey, uploadedBy: ctx.userId })
          .onConflictDoUpdate({
            target: campusPhotos.university,
            set: { storageKey, uploadedBy: ctx.userId, uploadedAt: new Date() },
          })
          .returning(),
      ),
    );
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
