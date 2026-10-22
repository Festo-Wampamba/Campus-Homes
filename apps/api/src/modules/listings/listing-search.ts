import type {
  ListingSearchInput,
  ListingSearchPageSort,
} from '@campushomes/shared';

/** A bed is available to a public search only when it is not blocked by a
 * live reservation, a room-level operational block, a unit block, or a bed
 * block. Keep these values in one place so `/search`, `/search-page`, and the
 * campus availability count cannot drift apart. */
export const LIVE_RESERVATION_STATUSES = ['reserved', 'booked', 'occupied'] as const;
export const UNAVAILABLE_OPERATIONAL_STATUSES = ['blocked', 'under_maintenance'] as const;
// Saved listings historically had no page-size cap. Keep that contract while
// still using the prepared projection; the value is an int bind, not SQL text.
export const SAVED_LISTINGS_LIMIT = 2_147_483_647;

/** The only configured public campus center at the moment. Adding another
 * live catchment is a data/configuration decision; distance is never inferred
 * from an arbitrary label or presented as a travel-time estimate. */
export const UNIVERSITY_CENTERS: Partial<Record<'MUK' | 'MUBS' | 'KIU' | 'KYU', { lat: number; lon: number }>> = {
  MUK: { lat: 0.3345, lon: 32.5687 },
};

export type ListingSearchQueryMode = 'items' | 'count';

export type ListingSearchQueryOptions = {
  mode: ListingSearchQueryMode;
  sort: ListingSearchPageSort;
  limit: number;
  offset: number;
  center: { lat: number; lon: number } | null;
  /** Restrict the projection to one student's saved listings. */
  savedStudentId?: string;
  /** Keep saved listings whose live inventory is currently empty. */
  includeUnavailable?: boolean;
};

export type ListingSearchQuery = {
  name: string;
  text: string;
  values: unknown[];
};

/**
 * Builds both public listing reads from one availability/filter projection.
 * The placeholders intentionally stay in the same positions for every mode;
 * `limit` is used by item queries and retained as a harmless bind for count
 * queries so the prepared statement shape remains stable.
 */
export function buildListingSearchQuery(
  input: ListingSearchInput,
  options: ListingSearchQueryOptions,
): ListingSearchQuery {
  const saved = options.savedStudentId != null;
  const savedJoin = saved
    ? `JOIN saved_listings sl_saved
       ON sl_saved.listing_id = l.id
      AND sl_saved.student_id = $18::uuid`
    : '';
  const savedProjection = saved ? 'sl_saved.created_at AS saved_at,' : '';
  const availableJoin = options.includeUnavailable
    ? 'LEFT JOIN available_summary available ON available.listing_id = l.id'
    : 'JOIN available_summary available ON available.listing_id = l.id';
  const availablePrice = options.includeUnavailable
    ? 'COALESCE(available.min_price, 0)'
    : 'available.min_price';
  const availableMaxPrice = options.includeUnavailable
    ? 'COALESCE(available.max_price, 0)'
    : 'available.max_price';
  const availableUnitCount = options.includeUnavailable
    ? 'COALESCE(available.unit_count, 0)'
    : 'available.unit_count';
  const availableRoomCount = options.includeUnavailable
    ? 'COALESCE(available.room_count, 0)'
    : 'available.room_count';
  const availableSelfContained = options.includeUnavailable
    ? 'COALESCE(available.has_self_contained, false)'
    : 'available.has_self_contained';

  const distanceExpression = `CASE
          WHEN $16::double precision IS NULL OR $17::double precision IS NULL THEN NULL
          ELSE ST_Distance(
            p.gps_point::geography,
            ST_SetSRID(ST_MakePoint($17::double precision, $16::double precision), 4326)::geography
          )
        END`;

  const commonSql = `
WITH available_beds AS (
  SELECT l.id AS listing_id,
         un.id AS unit_id,
         un.capacity,
         un.room_category,
         un.self_contained,
         usp.price_per_term_ugx
  FROM listings l
  JOIN units un
    ON un.property_id = l.property_id
  JOIN unit_semester_pricing usp
    ON usp.unit_id = un.id
   AND usp.semester_id = l.semester_id
  JOIN beds bd
    ON bd.unit_id = un.id
  WHERE l.status = 'verified'
    AND un.operational_status <> ALL($11::text[])
    AND NOT EXISTS (
      SELECT 1
      FROM unit_blocks ub
      WHERE ub.unit_id = un.id
        AND ub.cleared_at IS NULL
        AND ub.starts_at <= now()
        AND (ub.ends_at IS NULL OR ub.ends_at > now())
    )
    AND NOT bd.blocked
    AND NOT EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.bed_id = bd.id
        AND r.status = ANY($10::reservation_status[])
    )
    -- All inventory filters are applied before aggregation. A listing only
    -- qualifies when one available bed/room satisfies every room-level
    -- predicate, and displayed prices/counts are derived from that same set.
    AND ($5::int IS NULL OR usp.price_per_term_ugx <= $5)
    AND ($6::int IS NULL OR usp.price_per_term_ugx >= $6)
    AND ($7::int IS NULL OR un.capacity >= $7)
    AND ($12::text IS NULL OR un.room_category = $12::room_category)
    AND ($15::boolean IS NULL OR un.self_contained = $15)
), available_summary AS (
  SELECT listing_id,
         MIN(capacity) AS min_capacity,
         MAX(capacity) AS max_capacity,
         MIN(price_per_term_ugx) AS min_price,
         MAX(price_per_term_ugx) AS max_price,
         COUNT(*)::int AS unit_count,
         COUNT(DISTINCT unit_id)::int AS room_count,
         bool_or(self_contained) AS has_self_contained,
         bool_or(NOT self_contained) AS has_non_self_contained
  FROM available_beds
  GROUP BY listing_id
), available_categories AS (
  SELECT listing_id,
         jsonb_agg(
           jsonb_build_object(
             'category', category,
             'price_per_term_ugx', price_per_term_ugx,
             'unit_count', unit_count
           )
           ORDER BY price_per_term_ugx ASC, category ASC
         ) AS categories
  FROM (
    SELECT listing_id,
           room_category AS category,
           price_per_term_ugx,
           COUNT(*)::int AS unit_count
    FROM available_beds
    GROUP BY listing_id, room_category, price_per_term_ugx
  ) grouped
  GROUP BY listing_id
), eligible AS (
  SELECT l.id,
         l.property_id,
         l.semester_id,
         l.expires_at,
         l.verified_at AS verified_at,
         lv.id AS version_id,
         ${savedProjection}
         ${availablePrice} AS price_per_term_ugx,
         ${availableMaxPrice} AS max_price_per_term_ugx,
         lv.amenities,
         lv.description,
         p.name,
         p.street_address,
         p.gps_lat,
         p.gps_lon,
         p.catchment AS university,
         p.gender_arrangement,
         ph.storage_key AS photo_storage_key,
         available.min_capacity,
         available.max_capacity,
         ${availableUnitCount} AS unit_count,
         ${availableRoomCount} AS room_count,
         ${availableSelfContained} AS has_self_contained,
         COALESCE(categories.categories, '[]'::jsonb) AS room_categories,
         ${distanceExpression} AS distance_m,
         rating.rating_average,
         rating.rating_count
  FROM listings l
  ${savedJoin}
  JOIN listing_versions lv
    ON lv.id = l.current_version_id
  JOIN properties p
    ON p.id = l.property_id
  ${availableJoin}
  LEFT JOIN available_categories categories
    ON categories.listing_id = l.id
  LEFT JOIN LATERAL (
    SELECT storage_key
    FROM listing_photos
    WHERE listing_version_id = lv.id
    ORDER BY is_primary DESC, sort_order ASC
    LIMIT 1
  ) ph ON true
  LEFT JOIN LATERAL (
    SELECT
      ROUND(AVG(r.overall_rating)::numeric, 2)::double precision AS rating_average,
      COUNT(*)::int AS rating_count
    FROM reviews r
    JOIN listing_versions review_version
      ON review_version.id = r.listing_version_id
    JOIN listings review_listing
      ON review_listing.id = review_version.listing_id
    WHERE review_listing.property_id = l.property_id
      AND review_version.verified_at IS NOT NULL
  ) rating ON true
  WHERE l.status = 'verified'
    AND p.gps_point && ST_MakeEnvelope($1, $2, $3, $4, 4326)
    AND (
      $8::text IS NULL
      OR p.name ILIKE '%' || $8 || '%'
      OR p.street_address ILIKE '%' || $8 || '%'
    )
    AND ($13::text IS NULL OR p.catchment = $13::university)
    AND ($14::text IS NULL OR p.gender_arrangement = $14)
)
`;

  const values: unknown[] = [
    input.minLon,
    input.minLat,
    input.maxLon,
    input.maxLat,
    input.maxPriceUgx ?? null,
    input.minPriceUgx ?? null,
    input.minCapacity ?? null,
    input.q ?? null,
    options.limit,
    LIVE_RESERVATION_STATUSES,
    UNAVAILABLE_OPERATIONAL_STATUSES,
    input.roomCategory ?? null,
    input.university ?? null,
    input.genderArrangement ?? null,
    input.selfContained ?? null,
    options.center?.lat ?? null,
    options.center?.lon ?? null,
  ];
  if (saved) values.push(options.savedStudentId);

  if (options.mode === 'count') {
    return {
      name: 'listings_search_count',
      // Bind the page-size placeholder in the count statement too. It keeps
      // the prepared parameter shape identical to the item statement without
      // changing the count (limit is always positive after Zod validation).
      text: `${commonSql} SELECT COUNT(*)::int AS total FROM eligible WHERE $9::int > 0`,
      values,
    };
  }

  const orderBy = {
    price_asc: 'price_per_term_ugx ASC, id ASC',
    price_desc: 'price_per_term_ugx DESC, id ASC',
    distance_asc: 'distance_m ASC NULLS LAST, id ASC',
  }[options.sort];
  const savedOrder = saved ? 'saved_at DESC, id ASC' : orderBy;
  const offsetPlaceholder = saved ? '$19' : '$18';

  return {
    name: saved ? 'listings_saved_items' : `listings_search_items_${options.sort}`,
    text: `${commonSql} SELECT * FROM eligible ORDER BY ${savedOrder} LIMIT $9 OFFSET ${offsetPlaceholder}`,
    values: [...values, options.offset],
  };
}
