import crypto from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';

import {
  UGANDA_GPS_BOUNDS,
  type CreateOpsDraftListingInput,
  type IssueStrikeInput,
  type OpsKycDecisionInput,
  type PublishListingInput,
  type ScheduleVisitInput,
  type SyncVisitInput,
  type University,
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
   * progress, a passed visit awaiting the lead's approval, or a failed visit
   * awaiting a re-visit to be scheduled. Ops-only read. A visit that's
   * `passed` but not yet `approved_at` must stay in the queue — that's the
   * lead's own action item — so this can't just filter on `result = 'pending'`
   * alone. A `failed` latest visit must stay too: without it, a property
   * whose inspection failed drops out of every ops screen with no path back
   * to scheduling a re-visit — the property is neither pending (there's a
   * completed visit) nor does it ever get approved (a failed visit can't
   * be), so it would otherwise be silently orphaned forever. */
  queue(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const res = await client.query(
        `SELECT p.id, p.name, p.street_address, p.status, p.created_at,
                v.id AS visit_id, v.result, v.scheduled_at, v.inspector_id,
                l.kyc_status AS landlord_kyc_status,
                EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 AS age_hours
         FROM properties p
         JOIN landlords l ON l.user_id = p.landlord_id
         LEFT JOIN LATERAL (
           SELECT * FROM verification_visits vv
           WHERE vv.property_id = p.id
           ORDER BY vv.created_at DESC LIMIT 1
         ) v ON true
         WHERE v.id IS NULL
            OR v.result = 'pending'
            OR v.result = 'failed'
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

  /** An inspector's own already-reviewed visits — mirrors myVisits() but the
   * opposite half of the same query (approved, not pending). Without this,
   * a visit the lead approves simply vanishes from the inspector's world:
   * myVisits() correctly drops it (it's no longer a queue item), but nothing
   * ever showed it anywhere else, so from the inspector's side an approval
   * looked indistinguishable from data loss. */
  myVisitHistory(ctx: RlsContext) {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const res = await client.query(
        `SELECT vv.id AS visit_id, vv.property_id, vv.scheduled_at, vv.result,
                p.name AS property_name, p.street_address
         FROM verification_visits vv
         JOIN properties p ON p.id = vv.property_id
         WHERE vv.inspector_id = $1 AND vv.approved_at IS NOT NULL
         ORDER BY vv.approved_at DESC
         LIMIT 50`,
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

  /** Semesters applicable to a property's catchment that don't already carry a
   * listing — the picker for the ops "create the missing listing before
   * publish" step. A landlord-onboarded property has no listing at all
   * (submitProperty creates only the property row), so without this the lead
   * can approve a passed visit but has nothing to publish. Reads only, so it
   * runs under the caller's ops context (semesters are world-readable;
   * properties/listings are ops-readable). */
  publishableSemesters(ctx: RlsContext, propertyId: string) {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const res = await client.query(
        `SELECT s.id, s.name
         FROM semesters s
         JOIN properties p ON p.id = $1
         WHERE s.archived_at IS NULL
           AND (s.university IS NULL OR s.university = p.catchment)
           AND NOT EXISTS (
             SELECT 1 FROM listings l
             WHERE l.property_id = p.id AND l.semester_id = s.id
           )
         ORDER BY s.starts_on DESC`,
        [propertyId],
      );
      return res.rows as unknown[];
    });
  }

  /** Creates the draft listing a property needs before publish. Ops can't
   * INSERT listings under RLS (only the owning landlord or service_role can),
   * so this runs as service_role — same posture as admin property creation.
   * Idempotent against the (property_id, semester_id) unique index: an existing
   * non-verified listing is returned rather than conflicting. */
  async createDraftListing(ctx: RlsContext, input: CreateOpsDraftListingInput) {
    const listing = await this.rlsDb.run(SERVICE_CTX, async (db) => {
      const property = await db.query.properties.findFirst({
        where: eq(properties.id, input.propertyId),
      });
      if (!property) {
        throw new NotFoundException('Property not found');
      }
      // Re-validate the semester server-side: the picker only checks these
      // conditions at page-load, so a stale page (after a catchment change or
      // archive) or a direct API call could otherwise create a listing against
      // an inactive or wrong-catchment semester. Mirrors the admin path's
      // AdminPropertiesService.insertUnits guard — no DB constraint ties a
      // semester's university to a property's catchment.
      const validSemester = await db.query.semesters.findFirst({
        where: and(
          eq(semesters.id, input.semesterId),
          isNull(semesters.archivedAt),
          or(isNull(semesters.university), eq(semesters.university, property.catchment)),
        ),
      });
      if (!validSemester) {
        throw new BadRequestException(
          'Select an active semester configured for this property university',
        );
      }
      // Atomic idempotency: two leads (or a retry) racing on the same
      // property+semester would both miss a prior SELECT and one would 500 on
      // listings_property_semester_uk. onConflictDoNothing lets the loser fall
      // through to re-read the winner's row instead.
      const [inserted] = await db
        .insert(listings)
        .values({
          propertyId: input.propertyId,
          semesterId: input.semesterId,
          status: 'draft',
        })
        .onConflictDoNothing({ target: [listings.propertyId, listings.semesterId] })
        .returning();
      if (inserted) {
        return inserted;
      }
      const existing = await db.query.listings.findFirst({
        where: and(
          eq(listings.propertyId, input.propertyId),
          eq(listings.semesterId, input.semesterId),
        ),
      });
      if (!existing) {
        throw new ConflictException('Could not create the draft listing; please retry');
      }
      if (existing.status === 'verified') {
        throw new ConflictException('This property is already verified for that semester');
      }
      return existing;
    });
    await this.audit.record(ctx, 'listing.draft_create', 'listing', listing.id, {
      propertyId: input.propertyId,
      semesterId: input.semesterId,
    });
    return listing;
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
      // A fresh client key targeting an already-approved visit means a
      // second device/browser lost track of its local draft and is about to
      // blindly overwrite a decision the lead already made — the idempotency
      // check above only catches a *replay* of the same submission, not this.
      const current = await db.query.verificationVisits.findFirst({
        where: eq(verificationVisits.id, input.visitId),
      });
      if (!current) {
        throw new NotFoundException('Visit not found or not yours');
      }
      if (current.approvedAt) {
        throw new ConflictException('This visit has already been approved and can no longer be resubmitted');
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
        const lat = Number(row.visitGpsLat);
        const lon = Number(row.visitGpsLon);
        // syncVisitSchema rejects out-of-country GPS at submission time now,
        // but this guards legacy rows captured before that check existed —
        // silently promoting bad GPS here is what makes a listing "verified"
        // yet permanently invisible to search (a laptop's IP-based
        // geolocation fallback, or a VPN, can report a location continents
        // away with no error at capture time).
        if (
          lat < UGANDA_GPS_BOUNDS.minLat ||
          lat > UGANDA_GPS_BOUNDS.maxLat ||
          lon < UGANDA_GPS_BOUNDS.minLon ||
          lon > UGANDA_GPS_BOUNDS.maxLon
        ) {
          throw new BadRequestException(
            'This visit\'s captured GPS falls outside Uganda — it cannot be approved until the inspector recaptures location on-site (not from a desktop browser or VPN).',
          );
        }
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
      // Defense in depth alongside submitProperty()'s own gate: the
      // landlord could have been verified at submission time and rejected
      // or suspended (3-strike auto-suspend) any time before this, the
      // actual moment the listing becomes publicly visible — so the KYC
      // and account-status check is re-run here, not just trusted from
      // whenever the property was first created.
      const [property] = await db
        .select({ landlordId: properties.landlordId })
        .from(properties)
        .where(eq(properties.id, listing.propertyId));
      if (!property) {
        throw new NotFoundException('Property not found');
      }
      const [landlordAccount] = await db
        .select({ kycStatus: landlords.kycStatus, userStatus: users.status })
        .from(landlords)
        .innerJoin(users, eq(users.id, landlords.userId))
        .where(eq(landlords.userId, property.landlordId));
      if (!landlordAccount || landlordAccount.kycStatus !== 'verified') {
        throw new ConflictException(
          "This property's landlord is not KYC-verified — publishing is blocked until ops approves their identity",
        );
      }
      if (landlordAccount.userStatus !== 'active') {
        throw new ConflictException(
          "This property's landlord account is not active — publishing is blocked",
        );
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
      // Same lookup publishListing() uses to promote photos — surfaced here
      // so the publish screen can warn *before* publishing if the inspector
      // staged none, rather than the listing quietly going live photo-less.
      const approvedVisit = await db.query.verificationVisits.findFirst({
        where: and(
          eq(verificationVisits.propertyId, listing.propertyId),
          eq(verificationVisits.result, 'passed'),
        ),
        orderBy: (v, ops) => [ops.desc(v.approvedAt)],
      });
      const visitPhotoCount = (approvedVisit?.photoStorageKeys as string[] | null)?.length ?? 0;
      return { listing, property, visitPhotoCount };
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
      // Gives the property's own status column real meaning: it's set to
      // 'pending_kyc' at submission and otherwise never changes anywhere in
      // the codebase. A verified decision is the one event that should
      // release it — a rejection deliberately leaves it at 'pending_kyc'
      // rather than 'suspended', since nothing was ever live to suspend.
      if (input.decision === 'verified') {
        await db
          .update(properties)
          .set({ status: 'active' })
          .where(and(eq(properties.landlordId, landlordUserId), eq(properties.status, 'pending_kyc')));
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
