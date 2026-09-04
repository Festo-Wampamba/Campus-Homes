import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type {
  ListingSearchInput,
  SubmitPropertyInput,
  UnitOperationalStatus,
  UpdatePropertyInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import {
  beds,
  landlords,
  listingPhotos,
  listingVersions,
  listings,
  properties,
  propertyDocuments,
  propertyMedia,
  reservations,
  unitPhotos,
  units,
  unitSemesterPricing,
} from '../../db/schema';

/** A bed still counts as "live" (not available) under these statuses —
 * cancelled/expired/released reservations free the bed back up. An occupied
 * bed stays live indefinitely (no lease-end/renewal flow yet — out of scope
 * per the redesign doc §19). Mirrors the `reservations_one_live_hold_per_bed`
 * partial unique index (0033). */
const LIVE_RESERVATION_STATUSES = ['reserved', 'booked', 'occupied'] as const;

/** units.operational_status values that make every bed in a room unavailable
 * independent of any reservation (room-level manual override — maintenance,
 * deliberately blocked). Walk-in occupancy now goes through Book-on-Available
 * (0033) instead of an operational_status value, so 'available' is the only
 * "free" state left here. */
const UNAVAILABLE_OPERATIONAL_STATUSES = ['blocked', 'under_maintenance'] as const;

/** Anonymous/public reads: RLS only exposes `status = 'verified'` rows to a
 * non-ops, non-owner identity, so the nil uuid sees exactly the public set. */
const PUBLIC_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'student',
};

/** properties has no public SELECT policy (owner + ops only, 0001), so any
 * public query that joins it must run as service_role with an explicit
 * verified-only WHERE and a hand-picked column list — same pattern as the
 * unit-availability check below. Never let client-derived filters into these
 * queries beyond the Zod-validated inputs. */
const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

@Injectable()
export class ListingsService {
  constructor(private readonly rlsDb: RlsDb) {}

  // ── landlord paths ─────────────────────────────────────────────────────────

  // A landlord could otherwise submit properties before ops ever reviews
  // them — nothing else in the pipeline (visit scheduling, approval,
  // publish) checks kyc_status either, so an unreviewed or explicitly
  // rejected landlord's listing could reach the public verified state with
  // no KYC gate anywhere. Blocking here is the earliest, cheapest point.
  submitProperty(ctx: RlsContext, input: SubmitPropertyInput) {
    return this.rlsDb.run(ctx, async (db) => {
      const [landlord] = await db
        .select({ kycStatus: landlords.kycStatus })
        .from(landlords)
        .where(eq(landlords.userId, ctx.userId));
      if (!landlord) {
        throw new ForbiddenException('Complete your landlord profile before listing a property');
      }
      if (landlord.kycStatus !== 'verified') {
        throw new ForbiddenException(
          landlord.kycStatus === 'rejected'
            ? 'Your identity verification was not approved — contact support before listing a property'
            : 'Your identity verification is still pending review — you can list a property once it is approved',
        );
      }
      // 'pending_kyc' (the column default) only makes sense for a property
      // created before its landlord was reviewed — the gate above already
      // guarantees that isn't the case here, so inserting with the default
      // would leave this property permanently stuck at 'pending_kyc' with
      // nothing left to ever release it (decideKyc's flip only fires for
      // properties that already existed at the moment of approval).
      const [property] = await db
        .insert(properties)
        .values({
          landlordId: ctx.userId,
          name: input.name,
          alternativeName: input.alternativeName,
          streetAddress: input.streetAddress,
          locationDetails: input.locationDetails,
          type: input.type,
          genderArrangement: input.genderArrangement,
          catchment: input.catchment,
          otherCatchments: input.otherCatchments,
          status: 'active',
          proposedRoomCategories: input.proposedRoomCategories,
          proposedAmenities: input.proposedAmenities,
          furnishingItems: input.furnishingItems,
          securityFeatures: input.securityFeatures,
          accessibilityFeatures: input.accessibilityFeatures,
          photographyConsent: input.photographyConsent,
          selfContainedRoomCount: input.selfContainedRoomCount,
          nonSelfContainedRoomCount: input.nonSelfContainedRoomCount,
          transportShuttle: input.transportShuttle,
          advanceRentRequired: input.advanceRentRequired,
          bookingFeePercent: input.bookingFeePercent,
          rentPeriod: input.rentPeriod,
          rentPeriodOther: input.rentPeriodOther,
          authorityRole: input.authorityRole,
          authorityRoleOther: input.authorityRoleOther,
          coverPhotoKey: input.coverPhotoKey,
          declaredInfoAccurate: input.declaredInfoAccurate,
          declaredAuthorityOverProperty: input.declaredAuthorityOverProperty,
          declaredWillKeepUpdated: input.declaredWillKeepUpdated,
          declaredAuthorizesPublish: input.declaredAuthorizesPublish,
          declaredConsentToProcessing: input.declaredConsentToProcessing,
        })
        .returning();
      return property;
    });
  }

  // RLS (`properties_landlord_update`) already scopes this to the caller's
  // own rows — an id that isn't theirs updates zero rows, so the empty
  // result gives a clean 404 instead of a silent no-op (same pattern as
  // landlords.service upsertProfile's pending-only check).
  updateProperty(ctx: RlsContext, propertyId: string, input: UpdatePropertyInput) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    return this.rlsDb.run(ctx, async (db) => {
      const [property] = await db
        .update(properties)
        .set(input)
        .where(eq(properties.id, propertyId))
        .returning();
      if (!property) {
        throw new NotFoundException('Property not found');
      }
      return property;
    });
  }

  myProperties(ctx: RlsContext) {
    // RLS filters to the landlord's own rows.
    return this.rlsDb.run(ctx, (db) =>
      db.select().from(properties).orderBy(desc(properties.createdAt)),
    );
  }

  // Rooms + read-only reservation status + Ops-captured photos for one
  // property — everything here rides RLS under the caller's own landlord
  // context (units_read / reservations_landlord_read / listing_photos_read,
  // 0001), so a property/listing that isn't theirs never surfaces rows; no
  // extra ownership check needed beyond the properties SELECT below.
  propertyDetail(ctx: RlsContext, propertyId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
      if (!property) {
        throw new NotFoundException('Property not found');
      }

      // Independent of whether a listing exists yet — a landlord can add
      // whole-property gallery photos before Ops ever publishes anything.
      const propertyMediaRows = await db
        .select({ id: propertyMedia.id, storageKey: propertyMedia.storageKey })
        .from(propertyMedia)
        .where(and(eq(propertyMedia.propertyId, propertyId), eq(propertyMedia.mediaType, 'image')))
        .orderBy(asc(propertyMedia.sortOrder));

      // Prefer the currently-live verified listing (it's the one with real
      // rooms) over a newer re-verification draft, which starts with zero
      // units until Ops publishes it — picking "most recent by createdAt"
      // alone would shadow an active listing's rooms with an empty draft's.
      // Only fall back to the newest non-verified listing when the property
      // has never been verified at all.
      const [verifiedListing] = await db
        .select()
        .from(listings)
        .where(and(eq(listings.propertyId, propertyId), eq(listings.status, 'verified')))
        .orderBy(desc(listings.createdAt))
        .limit(1);

      const [listing] = verifiedListing
        ? [verifiedListing]
        : await db
            .select()
            .from(listings)
            .where(eq(listings.propertyId, propertyId))
            .orderBy(desc(listings.createdAt))
            .limit(1);

      if (!listing) {
        return { property, listing: null, photos: [], rooms: [], propertyMedia: propertyMediaRows };
      }

      const [version] = listing.currentVersionId
        ? await db.select().from(listingVersions).where(eq(listingVersions.id, listing.currentVersionId))
        : [];

      const photoRows = version
        ? await db
            .select({ storageKey: listingPhotos.storageKey })
            .from(listingPhotos)
            .where(eq(listingPhotos.listingVersionId, version.id))
            .orderBy(asc(listingPhotos.sortOrder))
        : [];

      // Rooms are permanent/property-level (2026-09) — which ones belong to
      // "this listing" is now whichever of the property's rooms have been
      // priced for this listing's semester, not a listing_id column on units.
      const roomRows = await db
        .select({
          id: units.id,
          label: units.label,
          capacity: units.capacity,
          roomCategory: units.roomCategory,
          operationalStatus: units.operationalStatus,
          pricePerTermUgx: unitSemesterPricing.pricePerTermUgx,
          depositUgx: unitSemesterPricing.depositUgx,
        })
        .from(units)
        .innerJoin(
          unitSemesterPricing,
          and(eq(unitSemesterPricing.unitId, units.id), eq(unitSemesterPricing.semesterId, listing.semesterId)),
        )
        .where(eq(units.propertyId, propertyId));
      const unitIds = roomRows.map((u) => u.id);

      const bedRows = unitIds.length
        ? await db.select().from(beds).where(inArray(beds.unitId, unitIds)).orderBy(asc(beds.label))
        : [];
      const bedIds = bedRows.map((b) => b.id);

      // A bed's current non-terminal reservation, if any — reserved/booked/
      // occupied are the only states worth showing the landlord here.
      const liveReservations = bedIds.length
        ? await db
            .select()
            .from(reservations)
            .where(
              and(
                inArray(reservations.bedId, bedIds),
                inArray(reservations.status, ['reserved', 'booked', 'occupied']),
              ),
            )
        : [];
      const reservationByBed = new Map(liveReservations.map((r) => [r.bedId, r]));

      const roomPhotoRows = unitIds.length
        ? await db
            .select({ id: unitPhotos.id, unitId: unitPhotos.unitId, storageKey: unitPhotos.storageKey })
            .from(unitPhotos)
            .where(inArray(unitPhotos.unitId, unitIds))
            .orderBy(asc(unitPhotos.sortOrder))
        : [];
      const photosByUnit = new Map<string, { id: string; storageKey: string }[]>();
      for (const row of roomPhotoRows) {
        const list = photosByUnit.get(row.unitId) ?? [];
        list.push({ id: row.id, storageKey: row.storageKey });
        photosByUnit.set(row.unitId, list);
      }

      const bedsByUnit = new Map<string, (typeof bedRows)[number][]>();
      for (const bed of bedRows) {
        const list = bedsByUnit.get(bed.unitId) ?? [];
        list.push(bed);
        bedsByUnit.set(bed.unitId, list);
      }

      return {
        property,
        listing: {
          id: listing.id,
          status: listing.status,
          description: version?.description ?? null,
          pricePerTermUgx: version?.pricePerTermUgx ?? null,
        },
        photos: photoRows.map((p) => p.storageKey),
        propertyMedia: propertyMediaRows,
        rooms: roomRows.map((u) => ({
          id: u.id,
          label: u.label,
          capacity: u.capacity,
          roomCategory: u.roomCategory,
          pricePerTermUgx: u.pricePerTermUgx,
          depositUgx: u.depositUgx,
          operationalStatus: u.operationalStatus,
          photos: photosByUnit.get(u.id) ?? [],
          beds: (bedsByUnit.get(u.id) ?? []).map((b) => {
            const r = reservationByBed.get(b.id);
            return {
              id: b.id,
              label: b.label,
              blocked: b.blocked,
              blockedReason: b.blockedReason,
              reservationId: r?.id ?? null,
              status: r?.status ?? null,
              reservedExpiresAt: r?.reservedExpiresAt ?? null,
              bookedAt: r?.bookedAt ?? null,
              bookingFeeCollectedUgx: r?.bookingFeeCollectedUgx ?? null,
              depositCollectedUgx: r?.depositCollectedUgx ?? null,
            };
          }),
        })),
      };
    });
  }

  // Landlord-only write surface for a specific room's photos — units
  // themselves stay Ops-only to write (RLS `units_ops_insert`/`_update`,
  // 0001), but `unit_photos_landlord_insert`/`_delete` (0008) scope this
  // table to the landlord who owns the unit's property.
  addUnitPhoto(ctx: RlsContext, unitId: string, storageKey: string) {
    // Insert either returns the row or throws (RLS WITH CHECK / the FK on
    // unit_id reject a room that doesn't exist or isn't theirs) — unlike
    // updateProperty/removeUnitPhoto's UPDATE/DELETE, there's no silent
    // empty-result case here to turn into a clean 404.
    return this.rlsDb.run(ctx, async (db) => {
      const [photo] = await db
        .insert(unitPhotos)
        .values({ unitId, storageKey, uploadedBy: ctx.userId })
        .returning();
      return photo;
    });
  }

  /** Whole-property gallery photos — distinct from listing_photos (Ops-only,
   * EXIF/GPS-verified during a visit) and unit_photos (per-room). Landlords
   * get a real write surface here (property_media_landlord_insert/_delete,
   * 0026) precisely because property_media never had the ops_staff FK
   * listing_photos does — it was already structurally landlord-shaped,
   * just never wired to a landlord endpoint or the public gallery before. */
  addPropertyMedia(ctx: RlsContext, propertyId: string, storageKey: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [media] = await db
        .insert(propertyMedia)
        .values({ propertyId, storageKey, mediaType: 'image', uploadedBy: ctx.userId })
        .returning();
      return media;
    });
  }

  removePropertyMedia(ctx: RlsContext, mediaId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [media] = await db
        .delete(propertyMedia)
        .where(eq(propertyMedia.id, mediaId))
        .returning();
      if (!media) {
        throw new NotFoundException('Photo not found');
      }
      return { ok: true };
    });
  }

  /** A landlord flipping a room's status by hand — the only unit field they
   * can write (0024: column-restricted UPDATE grant). Covers a tenant found
   * outside the reservation flow: without this, an off-platform let has no
   * way to stop the room from still showing as available to students. */
  updateUnitOperationalStatus(ctx: RlsContext, unitId: string, operationalStatus: UnitOperationalStatus) {
    return this.rlsDb.run(ctx, async (db) => {
      const [unit] = await db
        .update(units)
        .set({ operationalStatus })
        .where(eq(units.id, unitId))
        .returning();
      if (!unit) {
        throw new NotFoundException('Unit not found');
      }
      return unit;
    });
  }

  removeUnitPhoto(ctx: RlsContext, photoId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [photo] = await db
        .delete(unitPhotos)
        .where(eq(unitPhotos.id, photoId))
        .returning();
      if (!photo) {
        throw new NotFoundException('Photo not found');
      }
      return { ok: true };
    });
  }

  addDocument(ctx: RlsContext, propertyId: string, docType: string, storageKey: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [doc] = await db
        .insert(propertyDocuments)
        .values({
          propertyId,
          docType: docType as (typeof propertyDocuments.$inferInsert)['docType'],
          storageKey,
          uploadedBy: ctx.userId,
        })
        .returning();
      return doc;
    });
  }

  createDraftListing(ctx: RlsContext, propertyId: string, semesterId: string) {
    return this.rlsDb.run(ctx, async (db) => {
      const [listing] = await db
        .insert(listings)
        .values({ propertyId, semesterId, status: 'draft' })
        .returning();
      return listing;
    });
  }

  // Picker for the "request a listing" step (createDraftListing needs a
  // semesterId, but nothing previously let a landlord look one up — semesters
  // are world-readable (0001 semesters_read), so this runs under the caller's
  // own ctx, no service_role needed. university IS NULL means "applies to
  // every catchment", not "applies to none".
  semestersForCatchment(ctx: RlsContext, catchment?: string) {
    return this.rlsDb.run(ctx, async (db) =>
      db.query.semesters.findMany({
        where: (s, { and, isNull, or, eq, gte }) =>
          and(
            isNull(s.archivedAt),
            gte(s.endsOn, new Date().toISOString().slice(0, 10)),
            catchment ? or(isNull(s.university), eq(s.university, catchment as never)) : undefined,
          ),
        orderBy: (s, { asc }) => [asc(s.startsOn)],
      }),
    );
  }

  // ── public paths ───────────────────────────────────────────────────────────

  search(input: ListingSearchInput) {
    // service_role: the properties join is invisible to a public identity.
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      // gps_point is a generated PostGIS column with a GiST index (0001).
      // Photo + room-size spread ride along via LATERAL joins so a search
      // result never has to pretend a listing is one photo-less, one-size
      // room — units.capacity already varies per room, this just surfaces it.
      // lv.price_per_term_ugx is the *cheapest* room category (computed at
      // publish time, ops.service.ts) — "starting from", not the only price;
      // room_categories carries the full per-category breakdown for display.
      // min/max capacity, unit_count and room_categories all exclude units
      // with a live reservation (LIVE_RESERVATION_STATUSES) or a manually-set
      // unavailable operational_status (UNAVAILABLE_OPERATIONAL_STATUSES,
      // 0024 — catches a room let outside the reservation flow entirely) — a
      // search result must never advertise rooms that are already
      // held/paid/occupied, and a listing with nothing left to reserve is
      // excluded entirely below.
      const res = await client.query(
        `SELECT l.id, l.property_id, l.semester_id, l.expires_at,
                lv.id AS version_id, lv.price_per_term_ugx, lv.amenities, lv.description,
                p.name, p.street_address, p.gps_lat, p.gps_lon, p.catchment AS university,
                ph.storage_key AS photo_storage_key,
                u.min_capacity, u.max_capacity, COALESCE(u.unit_count, 0) AS unit_count,
                COALESCE(u.max_price, lv.price_per_term_ugx) AS max_price_per_term_ugx,
                COALESCE(rc.categories, '[]'::jsonb) AS room_categories
         FROM listings l
         JOIN listing_versions lv ON lv.id = l.current_version_id
         JOIN properties p ON p.id = l.property_id
         LEFT JOIN LATERAL (
           SELECT storage_key FROM listing_photos
           WHERE listing_version_id = lv.id
           ORDER BY is_primary DESC, sort_order ASC
           LIMIT 1
         ) ph ON true
         LEFT JOIN LATERAL (
           -- Joining beds fans a room out to one row per available bed, so
           -- COUNT(*) here is an available-BED count, not a room count — a
           -- partially-let double still contributes its one free bed. MIN/MAX
           -- capacity describe the room itself and are unaffected by the fan-out.
           SELECT MIN(un.capacity) AS min_capacity, MAX(un.capacity) AS max_capacity,
                  COUNT(*) AS unit_count, MAX(usp.price_per_term_ugx) AS max_price
           FROM units un
           JOIN unit_semester_pricing usp ON usp.unit_id = un.id AND usp.semester_id = l.semester_id
           JOIN beds bd ON bd.unit_id = un.id
           WHERE un.property_id = l.property_id
             AND un.operational_status <> ALL($11::text[])
             AND NOT bd.blocked
             AND NOT EXISTS (
               SELECT 1 FROM reservations r
               WHERE r.bed_id = bd.id AND r.status = ANY($10::reservation_status[])
             )
         ) u ON true
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'category', category,
                      'price_per_term_ugx', price_per_term_ugx,
                      'unit_count', unit_count
                    ) ORDER BY price_per_term_ugx ASC
                  ) AS categories
           FROM (
             -- Same available-bed-count fan-out as above, grouped per category.
             SELECT un.room_category AS category, usp.price_per_term_ugx, COUNT(*) AS unit_count
             FROM units un
             JOIN unit_semester_pricing usp ON usp.unit_id = un.id AND usp.semester_id = l.semester_id
             JOIN beds bd ON bd.unit_id = un.id
             WHERE un.property_id = l.property_id
               AND un.operational_status <> ALL($11::text[])
               AND NOT bd.blocked
               AND NOT EXISTS (
                 SELECT 1 FROM reservations r
                 WHERE r.bed_id = bd.id AND r.status = ANY($10::reservation_status[])
               )
             GROUP BY un.room_category, usp.price_per_term_ugx
           ) grouped
         ) rc ON true
          WHERE l.status = 'verified'
            AND p.gps_point && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            AND ($5::int IS NULL OR lv.price_per_term_ugx <= $5)
            AND ($6::int IS NULL OR lv.price_per_term_ugx >= $6)
            AND ($7::int IS NULL OR u.max_capacity >= $7)
            AND (
              $8::text IS NULL
              OR p.name ILIKE '%' || $8 || '%'
              OR p.street_address ILIKE '%' || $8 || '%'
            )
            AND (
              $12::text IS NULL OR EXISTS (
                SELECT 1 FROM units uf
                JOIN unit_semester_pricing uspf ON uspf.unit_id = uf.id AND uspf.semester_id = l.semester_id
                JOIN beds bf ON bf.unit_id = uf.id
                WHERE uf.property_id = l.property_id
                  AND uf.room_category = $12::room_category
                  AND uf.operational_status <> ALL($11::text[])
                  AND NOT bf.blocked
                  AND NOT EXISTS (
                    SELECT 1 FROM reservations rf
                    WHERE rf.bed_id = bf.id AND rf.status = ANY($10::reservation_status[])
                  )
              )
            )
            AND ($13::text IS NULL OR p.catchment = $13::university)
            AND COALESCE(u.unit_count, 0) > 0
          ORDER BY lv.price_per_term_ugx ASC
          LIMIT $9`,
        [
          input.minLon,
          input.minLat,
          input.maxLon,
          input.maxLat,
          input.maxPriceUgx ?? null,
          input.minPriceUgx ?? null,
          input.minCapacity ?? null,
          input.q ?? null,
          input.limit,
          LIVE_RESERVATION_STATUSES,
          UNAVAILABLE_OPERATIONAL_STATUSES,
          input.roomCategory ?? null,
          input.university ?? null,
        ],
      );
      // Pilot-funnel backstop (0032) — best-effort: a logging failure must
      // never break a search response. Same client/transaction, so no
      // nested-rlsDb.run risk.
      try {
        await client.query(
          `INSERT INTO product_events (event_type, payload) VALUES ('search', $1::jsonb)`,
          [JSON.stringify({ q: input.q ?? null, roomCategory: input.roomCategory ?? null, university: input.university ?? null, resultCount: res.rows.length })],
        );
      } catch (err) {
        console.error('[analytics] search event log failed:', err);
      }
      return res.rows as unknown[];
    });
  }

  detail(listingId: string) {
    return this.rlsDb.run(PUBLIC_CTX, async (db) => {
      const listing = await db.query.listings.findFirst({
        where: eq(listings.id, listingId),
      });
      if (!listing?.currentVersionId) {
        throw new NotFoundException('Listing not found');
      }
      const [version] = await db
        .select()
        .from(listingVersions)
        .where(eq(listingVersions.id, listing.currentVersionId));
      const photos = await db
        .select()
        .from(listingPhotos)
        .where(eq(listingPhotos.listingVersionId, listing.currentVersionId))
        .orderBy(listingPhotos.sortOrder);
      // Rooms are permanent/property-level (2026-09) — scope to this
      // listing's property + semester via unit_semester_pricing rather than
      // a listing_id column on units.
      const unitRows = await db
        .select({
          id: units.id,
          label: units.label,
          capacity: units.capacity,
          roomCategory: units.roomCategory,
          operationalStatus: units.operationalStatus,
          pricePerTermUgx: unitSemesterPricing.pricePerTermUgx,
          depositUgx: unitSemesterPricing.depositUgx,
        })
        .from(units)
        .innerJoin(
          unitSemesterPricing,
          and(eq(unitSemesterPricing.unitId, units.id), eq(unitSemesterPricing.semesterId, listing.semesterId)),
        )
        .where(eq(units.propertyId, listing.propertyId));
      // unit_photos_read (0008) allows public read once the parent listing is
      // verified — same PUBLIC_CTX this whole block already runs under.
      const unitIds = unitRows.map((u) => u.id);
      const unitPhotoRows = unitIds.length
        ? await db
            .select({ unitId: unitPhotos.unitId, storageKey: unitPhotos.storageKey })
            .from(unitPhotos)
            .where(inArray(unitPhotos.unitId, unitIds))
            .orderBy(asc(unitPhotos.sortOrder))
        : [];
      return { listing, version, photos, units: unitRows, unitPhotos: unitPhotoRows };
    }).then(async (detail) => {
      // Availability must be computed as service_role: under a public identity
      // RLS hides other students' held reservations, which would make every
      // unit look free. Only a boolean per unit leaves this query. The
      // property row rides along for the same reason (no public SELECT on
      // properties) — name/address/GPS of a verified listing are public data.
      const { availability, property, propertyMedia } = await this.rlsDb.run(
        SERVICE_CTX,
        async (_db, client) => {
          // Availability is per-bed now (0033) — a partially-let room still
          // has a free bed to reserve. A bed is available when it isn't
          // manually blocked, its room isn't under a room-level override
          // (maintenance/blocked), and it has no live (reserved/booked)
          // reservation on it.
          const availRes = await client.query(
            `SELECT b.id, b.unit_id, (
               NOT b.blocked
               AND u.operational_status <> ALL($3::text[])
               AND NOT EXISTS (
                 SELECT 1 FROM reservations r
                  WHERE r.bed_id = b.id AND r.status = ANY($2::reservation_status[])
               )
             ) AS available
             FROM beds b
             JOIN units u ON u.id = b.unit_id
             WHERE u.property_id = $1
               AND EXISTS (
                 SELECT 1 FROM unit_semester_pricing usp
                 WHERE usp.unit_id = u.id AND usp.semester_id = $4
               )`,
            [detail.listing.propertyId, LIVE_RESERVATION_STATUSES, UNAVAILABLE_OPERATIONAL_STATUSES, detail.listing.semesterId],
          );
          // Custodian contact rides along here too — landlords has no public
          // SELECT policy either, and a student deciding whether to reserve
          // needs a name/phone to actually reach, not just an address.
          const propRes = await client.query(
            `SELECT p.id, p.name, p.street_address, p.gps_lat, p.gps_lon,
                    p.booking_fee_percent, p.advance_rent_required,
                    u.name AS custodian_name, u.phone AS custodian_phone
             FROM properties p
             JOIN landlords l ON l.user_id = p.landlord_id
             JOIN users u ON u.id = l.user_id
             WHERE p.id = $1`,
            [detail.listing.propertyId],
          );
          // Property-level gallery photos — distinct from listing_photos
          // (Ops-only, EXIF/GPS-verified during a visit) and unit_photos
          // (per-room). property_media has no ops_staff FK, so it's the
          // landlord's own write surface for whole-property shots; property_
          // media has no public SELECT policy either (svc_all only, 0013),
          // hence reading it here alongside everything else on this ctx.
          const mediaRes = await client.query(
            `SELECT id, storage_key, caption
             FROM property_media
             WHERE property_id = $1 AND media_type = 'image'
             ORDER BY sort_order, created_at`,
            [detail.listing.propertyId],
          );
          // Pilot-funnel backstop (0032) — best-effort, same posture as the
          // search() event log above.
          try {
            await client.query(
              `INSERT INTO product_events (event_type, payload) VALUES ('listing_view', $1::jsonb)`,
              [JSON.stringify({ listingId })],
            );
          } catch (err) {
            console.error('[analytics] listing_view event log failed:', err);
          }
          return {
            availability: availRes.rows as { id: string; unit_id: string; available: boolean }[],
            property: propRes.rows[0] as {
              id: string;
              name: string;
              street_address: string;
              gps_lat: string | null;
              gps_lon: string | null;
              booking_fee_percent: string | number | null;
              advance_rent_required: boolean;
              custodian_name: string;
              custodian_phone: string | null;
            },
            propertyMedia: mediaRes.rows as { id: string; storage_key: string; caption: string | null }[],
          };
        },
      );
      return { ...detail, property, availability, propertyMedia };
    });
  }

  /** Bare name/address for the QR tenant-agreement landing page
   * (GET /listings/properties/:id/summary, public) — properties has no
   * public SELECT policy, same reasoning as detail()'s property lookup
   * above. Deliberately property-scoped, not listing-scoped: the QR code is
   * printed per-property and must resolve even for one with no published
   * listing yet. */
  propertySummary(propertyId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const res = await client.query(
        `SELECT id, name, street_address, catchment FROM properties WHERE id = $1`,
        [propertyId],
      );
      if (res.rowCount === 0) {
        throw new NotFoundException('Property not found');
      }
      return res.rows[0] as {
        id: string;
        name: string;
        street_address: string;
        catchment: string;
      };
    });
  }

  /** "Browse by university" tiles — GET /listings/campuses. Two small
   * queries merged in JS rather than one join: a catchment with zero
   * properties (but an Ops-uploaded photo already sitting there) should
   * still render, which a join FROM properties would silently drop. */
  campuses() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const counts = await client.query(
          `SELECT p.catchment AS university,
                  COUNT(*) FILTER (WHERE l.status = 'verified') AS hostel_count
           FROM properties p
           LEFT JOIN listings l ON l.property_id = p.id
           GROUP BY p.catchment`,
        );
      const photos = await client.query(`SELECT university, storage_key AS photo_storage_key FROM campus_photos`);
      const photoByUniversity = new Map(
        (photos.rows as { university: string; photo_storage_key: string }[]).map((p) => [
          p.university,
          p.photo_storage_key,
        ]),
      );
      const countByUniversity = new Map(
        (counts.rows as { university: string; hostel_count: string }[]).map((c) => [
          c.university,
          c.hostel_count,
        ]),
      );
      const universities = new Set([...photoByUniversity.keys(), ...countByUniversity.keys()]);
      return [...universities].map((university) => ({
        university,
        photo_storage_key: photoByUniversity.get(university) ?? null,
        hostel_count: countByUniversity.get(university) ?? 0,
      }));
    });
  }

  /** A student's favourited listings, enriched the same way search() is —
   * saved_listings itself is self-scoped by RLS, but the properties/units
   * join still needs service_role (properties has no public SELECT policy).
   * Dropped a listing that's since gone unverified: the reserve flow already
   * gates on 'verified', so a stale favourite would just be a dead end. */
  savedByStudent(studentId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const res = await client.query(
        `SELECT l.id, l.property_id, l.semester_id, l.expires_at,
                lv.id AS version_id, lv.price_per_term_ugx, lv.amenities, lv.description,
                p.name, p.street_address, p.gps_lat, p.gps_lon,
                ph.storage_key AS photo_storage_key,
                u.min_capacity, u.max_capacity, COALESCE(u.unit_count, 0) AS unit_count,
                COALESCE(u.max_price, lv.price_per_term_ugx) AS max_price_per_term_ugx,
                COALESCE(rc.categories, '[]'::jsonb) AS room_categories
         FROM saved_listings sl
         JOIN listings l ON l.id = sl.listing_id
         JOIN listing_versions lv ON lv.id = l.current_version_id
         JOIN properties p ON p.id = l.property_id
         LEFT JOIN LATERAL (
           SELECT storage_key FROM listing_photos
           WHERE listing_version_id = lv.id
           ORDER BY is_primary DESC, sort_order ASC
           LIMIT 1
         ) ph ON true
         LEFT JOIN LATERAL (
           SELECT MIN(un.capacity) AS min_capacity, MAX(un.capacity) AS max_capacity,
                  COUNT(*) AS unit_count, MAX(usp.price_per_term_ugx) AS max_price
           FROM units un
           JOIN unit_semester_pricing usp ON usp.unit_id = un.id AND usp.semester_id = l.semester_id
           WHERE un.property_id = l.property_id
         ) u ON true
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'category', category,
                      'price_per_term_ugx', price_per_term_ugx,
                      'unit_count', unit_count
                    ) ORDER BY price_per_term_ugx ASC
                  ) AS categories
           FROM (
             SELECT un.room_category AS category, usp.price_per_term_ugx, COUNT(*) AS unit_count
             FROM units un
             JOIN unit_semester_pricing usp ON usp.unit_id = un.id AND usp.semester_id = l.semester_id
             WHERE un.property_id = l.property_id
             GROUP BY un.room_category, usp.price_per_term_ugx
           ) grouped
         ) rc ON true
         WHERE sl.student_id = $1 AND l.status = 'verified'
         ORDER BY sl.created_at DESC`,
        [studentId],
      );
      return res.rows as unknown[];
    });
  }

  /** Public testimonials strip — GET /listings/reviews. Only ever real
   * reviews (RLS + trigger require a fulfilled reservation to write one) —
   * an empty result is rendered as an honest empty state, never faked. */
  reviews(limit: number) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const res = await client.query(
        `SELECT r.id, r.overall_rating, r.comment, r.submitted_at, p.name AS property_name
         FROM reviews r
         JOIN listing_versions lv ON lv.id = r.listing_version_id
         JOIN listings l ON l.id = lv.listing_id
         JOIN properties p ON p.id = l.property_id
         WHERE r.comment IS NOT NULL
         ORDER BY r.overall_rating DESC, r.submitted_at DESC
         LIMIT $1`,
        [limit],
      );
      return res.rows as unknown[];
    });
  }

  /** Public help/complaint contact — GET /listings/support-contact. Reads
   * the same platform_settings row the admin console writes, but exposes
   * only this one key to an unauthenticated caller. */
  supportContact() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const res = await client.query<{ value: { email: string; phone: string } }>(
        `SELECT value FROM platform_settings WHERE key = 'support_contact'`,
      );
      return res.rows[0]?.value ?? { email: 'support@campushomes.com', phone: '' };
    });
  }
}
