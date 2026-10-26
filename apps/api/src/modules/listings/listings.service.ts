import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type {
  ListingSearchInput,
  ListingSearchPageInput,
  SubmitPropertyInput,
  UnitOperationalStatus,
  UpdatePropertyInput,
  TrackEvent,
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
  roles,
  userRoleAssignments,
} from '../../db/schema';
import { PUBLIC_LANDLORD_SUMMARY_SQL } from './public-landlord-summary';
import { PropertyRoutes } from './property-routes';
import { NotificationsService } from '../notifications/notifications.service';
import { assertOwnedStorageKeys } from '../uploads/storage-key';
import {
  buildListingSearchQuery,
  LIVE_RESERVATION_STATUSES,
  SAVED_LISTINGS_LIMIT,
  UNIVERSITY_CENTERS,
  UNAVAILABLE_OPERATIONAL_STATUSES,
} from './listing-search';

/** `logEvent: false` keeps load-test traffic out of the search funnel. */
type SearchLogOptions = { logEvent?: boolean };

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
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly rlsDb: RlsDb,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly routes?: PropertyRoutes,
  ) {}

  // ── landlord paths ─────────────────────────────────────────────────────────

  // Pending KYC is an expected onboarding state: accept the property into
  // the review queue as `pending_kyc`, then decideKyc() releases it to
  // `active`. An explicitly rejected identity is still blocked, and
  // publishListing() independently re-checks KYC before anything goes live.
  async submitProperty(ctx: RlsContext, input: SubmitPropertyInput) {
    if (input.coverPhotoKey) assertOwnedStorageKeys(ctx.userId, [input.coverPhotoKey]);
    assertOwnedStorageKeys(ctx.userId, input.proposedRoomCategories.flatMap((row) => row.photoKeys ?? []));
    const property = await this.rlsDb.run(ctx, async (db) => {
      const [landlord] = await db
        .select({ kycStatus: landlords.kycStatus })
        .from(landlords)
        .where(eq(landlords.userId, ctx.userId));
      if (!landlord) {
        throw new ForbiddenException('Complete your landlord profile before listing a property');
      }
      if (landlord.kycStatus === 'rejected') {
        throw new ForbiddenException(
          'Your identity verification was not approved. Contact support before listing a property',
        );
      }
      const [property] = await db
        .insert(properties)
        .values({
          landlordId: ctx.userId,
          name: input.name,
          alternativeName: input.alternativeName,
          streetAddress: input.streetAddress,
          locationDetails: input.locationDetails,
          description: input.description ?? null,
          houseRules: input.houseRules,
          type: input.type,
          genderArrangement: input.genderArrangement,
          catchment: input.catchment,
          otherCatchments: input.otherCatchments,
          status: landlord.kycStatus === 'verified' ? 'active' : 'pending_kyc',
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
          rentPeriods: input.rentPeriods,
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
      if (!property) {
        throw new NotFoundException('Property submission could not be created');
      }
      return property;
    });

    // Runs after the submission transaction closes: the reviewer lookup and
    // notify() each open their own rlsDb.run, and nesting them inside the
    // submission's run would hold two pooled connections per request.
    // A self-service submission must surface in the reviewer workspace.
    // Do not rely on a client refresh or on a landlord's role assignment:
    // review is owned by active platform administrators.
    if (property.status === 'pending_kyc') {
      // Best-effort: the property is already committed, so a notification
      // failure must not fail (and invite a duplicate retry of) the POST.
      // Log the message only — an error object can carry connection strings.
      try {
        const reviewers = await this.rlsDb.run(SERVICE_CTX, (serviceDb) =>
          serviceDb
            .selectDistinct({ userId: userRoleAssignments.userId })
            .from(userRoleAssignments)
            .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
            .where(and(
              inArray(roles.key, ['super_admin', 'platform_admin']),
              eq(userRoleAssignments.scopeType, 'platform_wide'),
              // Keep this predicate explicit rather than assuming an assignment
              // remains usable after it has been revoked.
              isNull(userRoleAssignments.revokedAt),
            )),
        );
        await Promise.all(reviewers.map((reviewer) =>
          this.notifications?.notify(reviewer.userId, 'landlord.application_submitted', 'in_app', {
            message: `A landlord submitted ${property.name} for approval. Review the application before access is granted.`,
            href: '/admin/landlord-accounts',
          }),
        ));
      } catch (err) {
        this.logger.error(
          `Reviewer notification failed for property ${property.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
    return property;
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
      // Only a NEW cover photo must be the caller's upload; the edit form
      // resubmits the stored value (possibly a legacy Cloudinary URL) as-is.
      if (input.coverPhotoKey) {
        const [current] = await db
          .select({ coverPhotoKey: properties.coverPhotoKey })
          .from(properties)
          .where(eq(properties.id, propertyId));
        if (current?.coverPhotoKey !== input.coverPhotoKey) {
          assertOwnedStorageKeys(ctx.userId, [input.coverPhotoKey]);
        }
      }
      // Room-type photos already saved on this property may be resubmitted
      // as-is; any new one must be the caller's own upload.
      if (input.proposedRoomCategories) {
        const [current] = await db
          .select({ proposed: properties.proposedRoomCategories })
          .from(properties)
          .where(eq(properties.id, propertyId));
        const saved = new Set(
          ((current?.proposed ?? []) as { photoKeys?: string[] }[]).flatMap((row) => row.photoKeys ?? []),
        );
        assertOwnedStorageKeys(
          ctx.userId,
          input.proposedRoomCategories.flatMap((row) => row.photoKeys ?? []).filter((key) => !saved.has(key)),
        );
      }
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
    // RLS filters both statements to the landlord's own rows. Two statements,
    // one policied table each: never join/correlate RLS-heavy tables in one
    // statement (2026-09-23 incident).
    return this.rlsDb.run(ctx, async (db) => {
      const rows = await db.select().from(properties).orderBy(desc(properties.createdAt));
      if (rows.length === 0) return [];
      const live = await db
        .selectDistinct({ propertyId: listings.propertyId })
        .from(listings)
        .where(and(eq(listings.status, 'verified'), inArray(listings.propertyId, rows.map((p) => p.id))));
      const liveIds = new Set(live.map((l) => l.propertyId));
      return rows.map((p) => ({ ...p, hasLiveListing: liveIds.has(p.id) }));
    });
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
          selfContained: units.selfContained,
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
          selfContained: u.selfContained,
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
              bookingRequestedAt: r?.bookingRequestedAt ?? null,
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
      assertOwnedStorageKeys(ctx.userId, [storageKey]);
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
      assertOwnedStorageKeys(ctx.userId, [storageKey]);
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
      assertOwnedStorageKeys(ctx.userId, [storageKey]);
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

  search(input: ListingSearchInput, { logEvent = true }: SearchLogOptions = {}) {
    // Keep the legacy endpoint's array response while sharing all eligibility,
    // filters, and displayed-price semantics with the paged endpoint.
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      // ponytail: one generic plan per pooled connection, chosen without seeing
      // the bbox or filters (RLS planning cost ~100 ms vs ~40 ms to run). Fine at
      // pilot scale; if search slows as listings grow, EXPLAIN again and try
      // plan_cache_mode = auto. Named statements need a direct connection: a
      // transaction-mode pooler (PgBouncer, Neon pooled) loses them. A migration
      // that changes a selected column's type fails them with 0A000, and
      // withRlsContext then replaces the connection.
      await client.query('SET LOCAL plan_cache_mode = force_generic_plan');
      const query = buildListingSearchQuery(input, {
        mode: 'items',
        sort: 'price_asc',
        limit: input.limit,
        offset: 0,
        center: null,
      });
      const res = await client.query({
        name: 'listings_search',
        text: query.text,
        values: query.values,
      });
      if (logEvent) try {
        await client.query(
          `INSERT INTO product_events (event_type, payload) VALUES ('search', $1::jsonb)`,
          [JSON.stringify({
            q: input.q ?? null,
            roomCategory: input.roomCategory ?? null,
            university: input.university ?? null,
            resultCount: res.rows.length,
          })],
        );
      } catch (err) {
        console.error('[analytics] search event log failed:', err);
      }
      return res.rows as unknown[];
    });
  }

  searchPage(input: ListingSearchPageInput, { logEvent = true }: SearchLogOptions = {}) {
    const configuredCenter = UNIVERSITY_CENTERS[input.university] ?? null;
    const center = input.campusLat != null && input.campusLon != null
      ? { lat: input.campusLat, lon: input.campusLon }
      : configuredCenter;
    if (input.sort === 'distance_asc' && !center) {
      throw new BadRequestException(`No configured campus center for ${input.university}`);
    }
    const offset = (input.page - 1) * input.limit;
    if (!Number.isSafeInteger(offset)) {
      throw new BadRequestException('page is too large');
    }

    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('SET LOCAL plan_cache_mode = force_generic_plan');
      const countQuery = buildListingSearchQuery(input, {
        mode: 'count',
        sort: input.sort,
        limit: input.limit,
        offset,
        center,
      });
      const itemsQuery = buildListingSearchQuery(input, {
        mode: 'items',
        sort: input.sort,
        limit: input.limit,
        offset,
        center,
      });
      const countRes = await client.query({
        name: countQuery.name,
        text: countQuery.text,
        values: countQuery.values,
      });
      const itemsRes = await client.query({
        name: itemsQuery.name,
        text: itemsQuery.text,
        values: itemsQuery.values,
      });
      const total = Number(countRes.rows[0]?.total ?? 0);
      if (logEvent) try {
        await client.query(
          `INSERT INTO product_events (event_type, payload) VALUES ('search', $1::jsonb)`,
          [JSON.stringify({
            q: input.q ?? null,
            roomCategory: input.roomCategory ?? null,
            university: input.university,
            sort: input.sort,
            page: input.page,
            resultCount: itemsRes.rows.length,
            total,
          })],
        );
      } catch (err) {
        console.error('[analytics] search-page event log failed:', err);
      }
      return {
        items: itemsRes.rows as unknown[],
        total,
        page: input.page,
        pageSize: input.limit,
        hasMore: offset + itemsRes.rows.length < total,
      };
    });
  }

  recordEvent(event: TrackEvent) {
    return this.rlsDb.run(SERVICE_CTX, (_db, client) =>
      client.query(`INSERT INTO product_events (event_type, payload) VALUES ($1, $2::jsonb)`, [
        event.type,
        JSON.stringify({ path: event.path, cta: event.cta ?? null }),
      ]),
    );
  }

  detail(listingId: string) {
    return this.rlsDb.run(PUBLIC_CTX, async (db) => {
      const listing = await db.query.listings.findFirst({
        where: eq(listings.id, listingId),
      });
      if (!listing?.currentVersionId) {
        throw new NotFoundException('Listing not found');
      }
      // Same reason as search(): RLS makes planning cost more than executing,
      // so the heavier queries below are named statements with a forced
      // generic plan, planned once per pooled connection (staging EXPLAIN,
      // 2026-10-19: ~93 ms planning per detail call -> under 1 ms).
      // jit off here too, not just in the API pool: a generic plan's default
      // estimates cross jit_above_cost, and JIT then turned a 10 ms
      // availability query into 18 s on a pool without -c jit=off.
      await db.execute(sql`SELECT set_config('plan_cache_mode', 'force_generic_plan', true), set_config('jit', 'off', true)`);
      const [version] = await db
        .select()
        .from(listingVersions)
        .where(eq(listingVersions.id, sql.placeholder('versionId')))
        .prepare('listing_detail_version')
        .execute({ versionId: listing.currentVersionId });
      const photos = await db
        .select()
        .from(listingPhotos)
        .where(eq(listingPhotos.listingVersionId, sql.placeholder('versionId')))
        .orderBy(listingPhotos.sortOrder)
        .prepare('listing_detail_photos')
        .execute({ versionId: listing.currentVersionId });
      // Rooms are permanent/property-level (2026-09) — scope to this
      // listing's property + semester via unit_semester_pricing rather than
      // a listing_id column on units.
      const unitRows = await db
        .select({
          id: units.id,
          label: units.label,
          capacity: units.capacity,
          roomCategory: units.roomCategory,
          selfContained: units.selfContained,
          operationalStatus: units.operationalStatus,
          pricePerTermUgx: unitSemesterPricing.pricePerTermUgx,
          depositUgx: unitSemesterPricing.depositUgx,
        })
        .from(units)
        .innerJoin(
          unitSemesterPricing,
          and(
            eq(unitSemesterPricing.unitId, units.id),
            eq(unitSemesterPricing.semesterId, sql.placeholder('semesterId')),
          ),
        )
        .where(eq(units.propertyId, sql.placeholder('propertyId')))
        .prepare('listing_detail_units')
        .execute({ semesterId: listing.semesterId, propertyId: listing.propertyId });
      // unit_photos_read (0008) allows public read once the parent listing is
      // verified — same PUBLIC_CTX this whole block already runs under.
      // = ANY(array) rather than inArray(): one parameter keeps the statement
      // text, and so its cached plan, the same for any number of rooms.
      const unitIds = unitRows.map((u) => u.id);
      const unitPhotoRows = unitIds.length
        ? await db
            .select({ unitId: unitPhotos.unitId, storageKey: unitPhotos.storageKey })
            .from(unitPhotos)
            .where(sql`${unitPhotos.unitId} = ANY(${sql.placeholder('unitIds')}::uuid[])`)
            .orderBy(asc(unitPhotos.sortOrder))
            .prepare('listing_detail_unit_photos')
            .execute({ unitIds })
        : [];
      return { listing, version, photos, units: unitRows, unitPhotos: unitPhotoRows };
    }).then(async (detail) => {
      // Availability must be computed as service_role: under a public identity
      // RLS hides other students' held reservations, which would make every
      // unit look free. Only a boolean per unit leaves this query. The
      // property row rides along for the same reason (no public SELECT on
      // properties) — name/address/GPS of a verified listing are public data.
      const { availability, property, propertyMedia, roomTypePhotos, roomAmenities, landlord } = await this.rlsDb.run(
        SERVICE_CTX,
        async (_db, client) => {
          // Availability is per-bed now (0033) — a partially-let room still
          // has a free bed to reserve. A bed is available when it isn't
          // manually blocked, its room isn't under a room-level override
          // (maintenance/blocked), and it has no live (reserved/booked)
          // reservation on it.
          // Named + generic plan, as above: this was ~62 ms to plan, ~17 ms
          // to run. Every parameterized read after the set_config is named:
          // an unnamed one would still get a generic plan, rebuilt per call.
          await client.query(
            `SELECT set_config('plan_cache_mode', 'force_generic_plan', true), set_config('jit', 'off', true)`,
          );
          const availRes = await client.query({
            name: 'listing_detail_availability',
            text: `SELECT b.id, b.unit_id, (
               NOT b.blocked
               AND u.operational_status <> ALL($3::text[])
               AND NOT EXISTS (
                 SELECT 1 FROM unit_blocks ub
                 WHERE ub.unit_id = u.id AND ub.cleared_at IS NULL
                   AND ub.starts_at <= now() AND (ub.ends_at IS NULL OR ub.ends_at > now())
               )
               AND NOT EXISTS (
                 SELECT 1 FROM reservations r
                  WHERE r.bed_id = b.id AND r.status = ANY($2::reservation_status[])
               )
             ) AS available
             -- No per-bed hold flag: other students' holds stay private
             -- (Festo, 2026-10-15); a held bed is just unavailable here.
             FROM beds b
             JOIN units u ON u.id = b.unit_id
             WHERE u.property_id = $1
               AND EXISTS (
                 SELECT 1 FROM unit_semester_pricing usp
                 WHERE usp.unit_id = u.id AND usp.semester_id = $4
               )`,
            values: [
              detail.listing.propertyId,
              LIVE_RESERVATION_STATUSES,
              UNAVAILABLE_OPERATIONAL_STATUSES,
              detail.listing.semesterId,
            ],
          });
          const propRes = await client.query({
            name: 'listing_detail_property',
            text: `SELECT p.id, p.name, p.street_address, p.catchment, p.gps_lat, p.gps_lon,
                    p.booking_fee_percent, p.advance_rent_required, p.gender_arrangement,
                    p.house_rules
             FROM properties p
             WHERE p.id = $1`,
            values: [detail.listing.propertyId],
          });
          // Property-level gallery photos — distinct from listing_photos
          // (Ops-only, EXIF/GPS-verified during a visit) and unit_photos
          // (per-room). property_media has no ops_staff FK, so it's the
          // landlord's own write surface for whole-property shots; property_
          // media has no public SELECT policy either (svc_all only, 0013),
          // hence reading it here alongside everything else on this ctx.
          const mediaRes = await client.query({
            name: 'listing_detail_media',
            text: `SELECT id, storage_key, caption
             FROM property_media
             WHERE property_id = $1 AND media_type = 'image'
             ORDER BY sort_order, created_at`,
            values: [detail.listing.propertyId],
          });
          // Photos the landlord added to each room type in Manage Rooms. Only
          // the room type's current (approved) version is public, and each
          // photo is reported against every priced room of that type.
          const roomTypePhotoRes = await client.query({
            name: 'listing_detail_room_type_photos',
            text: `SELECT u.id AS "unitId", rtp.storage_key AS "storageKey"
             FROM units u
             JOIN room_types rt ON rt.id = u.room_type_id
             JOIN room_type_photos rtp ON rtp.room_type_version_id = rt.current_version_id
             WHERE u.property_id = $1
               AND EXISTS (
                 SELECT 1 FROM unit_semester_pricing usp
                 WHERE usp.unit_id = u.id AND usp.semester_id = $2
               )
             ORDER BY rtp.is_primary DESC, rtp.sort_order`,
            values: [detail.listing.propertyId, detail.listing.semesterId],
          });
          // Only approved room-type snapshots can supply public room amenities.
          const roomAmenitiesRes = await client.query({
            name: 'listing_detail_room_amenities',
            text: `SELECT u.id, rtv.amenities
             FROM units u
             JOIN room_types rt ON rt.id = u.room_type_id
             JOIN room_type_versions rtv ON rtv.id = rt.current_version_id AND rtv.status = 'approved'
             WHERE u.property_id = $1`,
            values: [detail.listing.propertyId],
          });
          const landlordRes = await client.query({
            name: 'listing_detail_landlord',
            text: PUBLIC_LANDLORD_SUMMARY_SQL,
            values: [detail.listing.propertyId],
          });
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
              catchment: string | null;
              gps_lat: string | null;
              gps_lon: string | null;
              booking_fee_percent: string | number | null;
              advance_rent_required: boolean;
              gender_arrangement: string | null;
              house_rules: string[];
            },
            propertyMedia: mediaRes.rows as { id: string; storage_key: string; caption: string | null }[],
            roomTypePhotos: roomTypePhotoRes.rows as { unitId: string; storageKey: string }[],
            roomAmenities: roomAmenitiesRes.rows as { id: string; amenities: string[] }[],
            landlord: landlordRes.rows[0] ?? null,
          };
        },
      );
      const amenitiesByUnit = new Map(roomAmenities.map(room => [room.id, room.amenities]));
      // Road distance to the hostel's campus (Google's fastest driving route),
      // looked up after the transaction closes so a slow provider never holds
      // a pooled connection. Straight-line is only for the student estimator.
      const campusCenter = property?.catchment
        ? UNIVERSITY_CENTERS[property.catchment as keyof typeof UNIVERSITY_CENTERS]
        : undefined;
      const lat = Number(property?.gps_lat);
      const lon = Number(property?.gps_lon);
      const drive = this.routes && campusCenter && property?.gps_lat != null && property?.gps_lon != null
        && Number.isFinite(lat) && Number.isFinite(lon)
        ? await this.routes.forProperty(property.id, property.catchment!, { lat, lon }, campusCenter)
        : null;
      return {
        ...detail, property, availability, propertyMedia, landlord,
        route: drive ? { mode: 'drive' as const, ...drive } : null,
        units: detail.units.map(unit => ({ ...unit, amenities: amenitiesByUnit.get(unit.id) ?? [] })),
        unitPhotos: [...detail.unitPhotos, ...roomTypePhotos],
      };
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
                  COUNT(*) FILTER (WHERE l.status = 'verified') AS hostel_count,
                  COUNT(*) FILTER (
                    WHERE l.status = 'verified'
                      AND EXISTS (
                        SELECT 1
                        FROM units un
                        JOIN unit_semester_pricing usp
                          ON usp.unit_id = un.id
                         AND usp.semester_id = l.semester_id
                        JOIN beds bd ON bd.unit_id = un.id
                        WHERE un.property_id = p.id
                          AND un.operational_status <> ALL($1::text[])
                          AND NOT bd.blocked
                          AND NOT EXISTS (
                            SELECT 1
                            FROM unit_blocks ub
                            WHERE ub.unit_id = un.id
                              AND ub.cleared_at IS NULL
                              AND ub.starts_at <= now()
                              AND (ub.ends_at IS NULL OR ub.ends_at > now())
                          )
                          AND NOT EXISTS (
                            SELECT 1
                            FROM reservations r
                            WHERE r.bed_id = bd.id
                              AND r.status = ANY($2::reservation_status[])
                          )
                      )
                  ) AS available_hostel_count
           FROM properties p
           LEFT JOIN listings l ON l.property_id = p.id
           GROUP BY p.catchment`,
          [UNAVAILABLE_OPERATIONAL_STATUSES, LIVE_RESERVATION_STATUSES],
        );
      const photos = await client.query(`SELECT university, storage_key AS photo_storage_key FROM campus_photos`);
      const photoByUniversity = new Map(
        (photos.rows as { university: string; photo_storage_key: string }[]).map((p) => [
          p.university,
          p.photo_storage_key,
        ]),
      );
      const countByUniversity = new Map(
        (counts.rows as { university: string; hostel_count: string; available_hostel_count: string }[]).map((c) => [
          c.university,
          { hostel_count: c.hostel_count, available_hostel_count: c.available_hostel_count },
        ]),
      );
      const universities = new Set([...photoByUniversity.keys(), ...countByUniversity.keys()]);
      return [...universities].map((university) => ({
        university,
        photo_storage_key: photoByUniversity.get(university) ?? null,
        hostel_count: Number(countByUniversity.get(university)?.hostel_count ?? 0),
        available_hostel_count: Number(countByUniversity.get(university)?.available_hostel_count ?? 0),
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
      const query = buildListingSearchQuery({
        minLon: -180,
        minLat: -90,
        maxLon: 180,
        maxLat: 90,
        limit: SAVED_LISTINGS_LIMIT,
      }, {
        mode: 'items',
        sort: 'price_asc',
        limit: SAVED_LISTINGS_LIMIT,
        offset: 0,
        center: null,
        savedStudentId: studentId,
        includeUnavailable: true,
      });
      const res = await client.query(
        query.text,
        query.values,
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
           AND l.status = 'verified'
           AND lv.verified_at IS NOT NULL
         ORDER BY r.overall_rating DESC, r.submitted_at DESC
         LIMIT $1`,
        [limit],
      );
      return res.rows as unknown[];
    });
  }

  /** Reviews for a public listing, aggregated at property level so a
   * student's completed stay remains useful when a landlord publishes a new
   * listing version. Only verified listing versions contribute; student
   * identity is deliberately absent from both the aggregate and item query. */
  listingReviews(listingId: string, page: number, limit: number) {
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      throw new BadRequestException('page is too large');
    }

    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const listingRes = await client.query<{ property_id: string }>(
        `SELECT l.property_id
         FROM listings l
         JOIN listing_versions lv ON lv.id = l.current_version_id
         WHERE l.id = $1
           AND l.status = 'verified'`,
        [listingId],
      );
      const propertyId = listingRes.rows[0]?.property_id;
      if (!propertyId) {
        throw new NotFoundException('Listing not found');
      }

      const aggregateRes = await client.query<{ average: number | string | null; total: number | string }>(
        `SELECT
           ROUND(AVG(r.overall_rating)::numeric, 2)::double precision AS average,
           COUNT(*)::int AS total
         FROM reviews r
         JOIN listing_versions review_version ON review_version.id = r.listing_version_id
         JOIN listings review_listing ON review_listing.id = review_version.listing_id
         WHERE review_listing.property_id = $1
           AND review_version.verified_at IS NOT NULL`,
        [propertyId],
      );
      const itemsRes = await client.query(
        `SELECT r.id, r.overall_rating, r.comment, r.submitted_at
         FROM reviews r
         JOIN listing_versions review_version ON review_version.id = r.listing_version_id
         JOIN listings review_listing ON review_listing.id = review_version.listing_id
         WHERE review_listing.property_id = $1
           AND review_version.verified_at IS NOT NULL
         ORDER BY r.submitted_at DESC, r.id ASC
         LIMIT $2 OFFSET $3`,
        [propertyId, limit, offset],
      );
      const aggregate = aggregateRes.rows[0];
      const total = Number(aggregate?.total ?? 0);
      return {
        items: itemsRes.rows as unknown[],
        average: aggregate?.average == null ? null : Number(aggregate.average),
        total,
        page,
        pageSize: limit,
        hasMore: offset + itemsRes.rows.length < total,
      };
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
      return res.rows[0]?.value ?? { email: 'hello@campushomes.co.ug', phone: '' };
    });
  }
}
