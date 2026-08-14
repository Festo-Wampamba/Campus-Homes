import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type {
  ListingSearchInput,
  SubmitPropertyInput,
  UpdatePropertyInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import {
  listingPhotos,
  listingVersions,
  listings,
  properties,
  propertyDocuments,
  reservations,
  unitPhotos,
  units,
} from '../../db/schema';

/** A unit still counts as "live" (not available) under these statuses —
 * cancelled/refunded/expired holds free the room back up. Mirrors the
 * `reservations_one_live_hold_per_unit` partial unique index (0001). */
const LIVE_RESERVATION_STATUSES = ['held', 'payment_pending', 'fulfilled'] as const;

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

  submitProperty(ctx: RlsContext, input: SubmitPropertyInput) {
    return this.rlsDb.run(ctx, async (db) => {
      const [property] = await db
        .insert(properties)
        .values({
          landlordId: ctx.userId,
          name: input.name,
          streetAddress: input.streetAddress,
          type: input.type,
          catchment: input.catchment,
          proposedRoomCategories: input.proposedRoomCategories,
          proposedAmenities: input.proposedAmenities,
          coverPhotoKey: input.coverPhotoKey,
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
        return { property, listing: null, photos: [], rooms: [] };
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

      const roomRows = await db.select().from(units).where(eq(units.listingId, listing.id));
      const unitIds = roomRows.map((u) => u.id);
      const liveReservations = unitIds.length
        ? await db
            .select({ unitId: reservations.unitId, status: reservations.status })
            .from(reservations)
            .where(
              and(
                inArray(reservations.unitId, unitIds),
                inArray(reservations.status, LIVE_RESERVATION_STATUSES),
              ),
            )
            .orderBy(asc(reservations.createdAt))
        : [];
      // Later rows overwrite earlier ones, so each unit ends up with its
      // most recent live reservation — the partial unique index means
      // there's realistically at most one anyway.
      const statusByUnit = new Map(liveReservations.map((r) => [r.unitId, r.status]));

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

      return {
        property,
        listing: {
          id: listing.id,
          status: listing.status,
          description: version?.description ?? null,
          pricePerTermUgx: version?.pricePerTermUgx ?? null,
        },
        photos: photoRows.map((p) => p.storageKey),
        rooms: roomRows.map((u) => ({
          id: u.id,
          label: u.label,
          capacity: u.capacity,
          roomCategory: u.roomCategory,
          pricePerTermUgx: u.pricePerTermUgx,
          reservationStatus: statusByUnit.get(u.id) ?? null,
          photos: photosByUnit.get(u.id) ?? [],
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
           SELECT MIN(capacity) AS min_capacity, MAX(capacity) AS max_capacity,
                  COUNT(*) AS unit_count, MAX(price_per_term_ugx) AS max_price
           FROM units WHERE listing_id = l.id
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
             SELECT room_category AS category, price_per_term_ugx, COUNT(*) AS unit_count
             FROM units WHERE listing_id = l.id
             GROUP BY room_category, price_per_term_ugx
           ) grouped
         ) rc ON true
         WHERE l.status = 'verified'
           AND p.gps_point && ST_MakeEnvelope($1, $2, $3, $4, 4326)
           AND ($5::int IS NULL OR lv.price_per_term_ugx <= $5)
           AND ($6::int IS NULL OR lv.price_per_term_ugx >= $6)
           AND ($7::int IS NULL OR u.max_capacity >= $7)
           AND ($8::text IS NULL OR p.name ILIKE '%' || $8 || '%')
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
        ],
      );
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
      const unitRows = await db.select().from(units).where(eq(units.listingId, listingId));
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
      const { availability, property } = await this.rlsDb.run(
        SERVICE_CTX,
        async (_db, client) => {
          const availRes = await client.query(
            `SELECT u.id, NOT EXISTS (
               SELECT 1 FROM reservations r
               WHERE r.unit_id = u.id AND r.status = 'held'
             ) AS available
             FROM units u WHERE u.listing_id = $1`,
            [listingId],
          );
          // Custodian contact rides along here too — landlords has no public
          // SELECT policy either, and a student deciding whether to reserve
          // needs a name/phone to actually reach, not just an address.
          const propRes = await client.query(
            `SELECT p.id, p.name, p.street_address, p.gps_lat, p.gps_lon,
                    u.name AS custodian_name, u.phone AS custodian_phone
             FROM properties p
             JOIN landlords l ON l.user_id = p.landlord_id
             JOIN users u ON u.id = l.user_id
             WHERE p.id = $1`,
            [detail.listing.propertyId],
          );
          return {
            availability: availRes.rows as { id: string; available: boolean }[],
            property: propRes.rows[0] as {
              id: string;
              name: string;
              street_address: string;
              gps_lat: string | null;
              gps_lon: string | null;
              custodian_name: string;
              custodian_phone: string | null;
            },
          };
        },
      );
      return { ...detail, property, availability };
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
           SELECT MIN(capacity) AS min_capacity, MAX(capacity) AS max_capacity,
                  COUNT(*) AS unit_count, MAX(price_per_term_ugx) AS max_price
           FROM units WHERE listing_id = l.id
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
             SELECT room_category AS category, price_per_term_ugx, COUNT(*) AS unit_count
             FROM units WHERE listing_id = l.id
             GROUP BY room_category, price_per_term_ugx
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
}
