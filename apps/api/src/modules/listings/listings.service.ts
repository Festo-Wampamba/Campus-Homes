import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import type {
  ListingSearchInput,
  SubmitPropertyInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import {
  listingPhotos,
  listingVersions,
  listings,
  properties,
  propertyDocuments,
  units,
} from '../../db/schema';

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
        })
        .returning();
      return property;
    });
  }

  myProperties(ctx: RlsContext) {
    // RLS filters to the landlord's own rows.
    return this.rlsDb.run(ctx, (db) =>
      db.select().from(properties).orderBy(desc(properties.createdAt)),
    );
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
      const res = await client.query(
        `SELECT l.id, l.property_id, l.semester_id, l.expires_at,
                lv.id AS version_id, lv.price_per_term_ugx, lv.amenities, lv.description,
                p.name, p.street_address, p.gps_lat, p.gps_lon
         FROM listings l
         JOIN listing_versions lv ON lv.id = l.current_version_id
         JOIN properties p ON p.id = l.property_id
         WHERE l.status = 'verified'
           AND p.gps_point && ST_MakeEnvelope($1, $2, $3, $4, 4326)
           AND ($5::int IS NULL OR lv.price_per_term_ugx <= $5)
         ORDER BY lv.price_per_term_ugx ASC
         LIMIT $6`,
        [
          input.minLon,
          input.minLat,
          input.maxLon,
          input.maxLat,
          input.maxPriceUgx ?? null,
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
      return { listing, version, photos, units: unitRows };
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
          const propRes = await client.query(
            `SELECT id, name, street_address, gps_lat, gps_lon
             FROM properties WHERE id = $1`,
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
            },
          };
        },
      );
      return { ...detail, property, availability };
    });
  }
}
