import {
  listingReviewsQuerySchema,
  listingSearchPageSchema,
} from '@campushomes/shared';
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { buildListingSearchQuery } from '../../src/modules/listings/listing-search';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { testDatabaseUrl } from '../test-database-url';

const bounds = {
  minLon: 32.5,
  minLat: 0.25,
  maxLon: 32.65,
  maxLat: 0.42,
};

describe('public listing search contracts', () => {
  it('defaults the paged search to MUK, page one, and price ascending', () => {
    const input = listingSearchPageSchema.parse(bounds);

    expect(input).toMatchObject({
      university: 'MUK',
      sort: 'price_asc',
      page: 1,
      limit: 20,
    });
  });

  it('requires explicit campus coordinates as a pair', () => {
    const result = listingSearchPageSchema.safeParse({ ...bounds, campusLat: 0.3345 });

    expect(result.success).toBe(false);
  });

  it('rejects inverted bounding boxes and price ranges before they reach PostGIS', () => {
    expect(listingSearchPageSchema.safeParse({
      ...bounds,
      minLat: 0.42,
      maxLat: 0.25,
    }).success).toBe(false);
    expect(listingSearchPageSchema.safeParse({
      ...bounds,
      minLon: 32.65,
      maxLon: 32.5,
    }).success).toBe(false);
    expect(listingSearchPageSchema.safeParse({
      ...bounds,
      minPriceUgx: 900_000,
      maxPriceUgx: 400_000,
    }).success).toBe(false);
  });

  it('uses one available-bed projection for filters and displayed prices', () => {
    const input = listingSearchPageSchema.parse({
      ...bounds,
      minPriceUgx: 400_000,
      maxPriceUgx: 900_000,
      minCapacity: 2,
      roomCategory: 'single',
      selfContained: true,
      sort: 'price_desc',
      page: 2,
      limit: 10,
    });
    const query = buildListingSearchQuery(input, {
      mode: 'items',
      sort: input.sort,
      limit: input.limit,
      offset: 10,
      center: { lat: 0.3345, lon: 32.5687 },
    });

    expect(query.text).toContain('WITH available_beds AS');
    expect(query.text).toContain('available.min_price AS price_per_term_ugx');
    expect(query.text).toContain('available.max_price AS max_price_per_term_ugx');
    expect(query.text).toContain('ORDER BY price_per_term_ugx DESC, id ASC');
    const availabilityEnd = query.text.indexOf('), available_summary AS');
    expect(availabilityEnd).toBeGreaterThan(0);
    expect(query.text.indexOf('usp.price_per_term_ugx <= $5')).toBeLessThan(availabilityEnd);
    expect(query.text.indexOf('usp.price_per_term_ugx >= $6')).toBeLessThan(availabilityEnd);
    expect(query.text.indexOf('un.capacity >= $7')).toBeLessThan(availabilityEnd);
    expect(query.text.indexOf('un.room_category = $12::room_category')).toBeLessThan(availabilityEnd);
    expect(query.text.indexOf('un.self_contained = $15')).toBeLessThan(availabilityEnd);
    expect(query.text).not.toContain('category_filter');
    expect(query.values[4]).toBe(900_000);
    expect(query.values[5]).toBe(400_000);
    expect(query.values[6]).toBe(2);
    expect(query.values[11]).toBe('single');
    expect(query.values[14]).toBe(true);
    expect(query.values[17]).toBe(10);
  });

  it('supports a count query with the same eligibility SQL', () => {
    const input = listingSearchPageSchema.parse(bounds);
    const query = buildListingSearchQuery(input, {
      mode: 'count',
      sort: input.sort,
      limit: input.limit,
      offset: 0,
      center: { lat: 0.3345, lon: 32.5687 },
    });

    expect(query.text).toContain('WITH available_beds AS');
    expect(query.text).toContain('SELECT COUNT(*)::int AS total FROM eligible WHERE $9::int > 0');
    expect(query.text).not.toContain('OFFSET $18');
  });
});

describe('public listing review contracts', () => {
  it('defaults paged reviews to the first twenty rows', () => {
    expect(listingReviewsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });
});

type SeedListing = { id: string; versionId: string };
type SeedRoom = { id: string; bedIds: string[] };
type SearchItem = {
  id: string;
  price_per_term_ugx: number | string;
  max_price_per_term_ugx: number | string;
  min_capacity: number | string | null;
  max_capacity: number | string | null;
  unit_count: number | string;
  room_count: number | string;
  has_self_contained: boolean;
  room_categories: Array<{
    category: string;
    price_per_term_ugx: number;
    unit_count: number;
  }>;
};

type SearchPage = {
  items: SearchItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

describe('public listing search and review DB contracts', () => {
  const DB_URL = testDatabaseUrl();
  const pool = new Pool({ connectionString: DB_URL, max: 5 });
  const listings = new ListingsService(new RlsDb(pool));
  const fullChecklist = Object.fromEntries(
    ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety']
      .map((component) => [component, { passed: true }]),
  );
  const searchBounds = {
    minLon: 32.5,
    minLat: 0.25,
    maxLon: 32.65,
    maxLat: 0.42,
  };

  let opsUserId: string;
  let landlordId: string;
  let semesterId: string;
  let studentId: string;
  let secondStudentId: string;
  let searchListingA: SeedListing;
  let searchListingB: SeedListing;
  let searchListingC: SeedListing;
  let unavailableListing: SeedListing;
  let hiddenListingId: string;
  let reviewListing: SeedListing;

  async function idFrom(sql: string, values: unknown[] = []): Promise<string> {
    const result = await pool.query<{ id: string }>(sql, values);
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`Seed query returned no id: ${sql}`);
    return id;
  }

  async function createProperty(name: string, lat: number, lon: number): Promise<string> {
    const propertyId = await idFrom(
      `INSERT INTO properties
         (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
       VALUES ($1, $2, $3, 'active', $4, $5, 'MUK')
       RETURNING id`,
      [landlordId, name, `${name} Street`, lat, lon],
    );
    await pool.query(
      `INSERT INTO verification_visits
         (property_id, inspector_id, checklist, client_idempotency_key, result,
          approved_by, approved_at, completed_at)
       VALUES ($1, $2, $3::jsonb, $4, 'passed', $2, now(), now())`,
      [propertyId, opsUserId, JSON.stringify(fullChecklist), `contract-visit-${propertyId}`],
    );
    return propertyId;
  }

  async function createVerifiedListing(propertyId: string, name: string, price: number): Promise<SeedListing> {
    const listingId = await idFrom(
      `INSERT INTO listings (property_id, semester_id, status)
       VALUES ($1, $2, 'draft') RETURNING id`,
      [propertyId, semesterId],
    );
    const versionId = await idFrom(
      `INSERT INTO listing_versions
         (listing_id, version_number, price_per_term_ugx, amenities,
          description, verified_at, verified_by)
       VALUES ($1, 1, $2, '{}'::jsonb, $3, now(), $4)
       RETURNING id`,
      [listingId, price, `${name} description`, opsUserId],
    );
    await pool.query(
      `UPDATE listings
       SET status = 'verified', current_version_id = $1,
           verified_at = now(), expires_at = '2026-12-31T23:59:59Z'
       WHERE id = $2`,
      [versionId, listingId],
    );
    return { id: listingId, versionId };
  }

  async function createListingVersion(listingId: string, versionNumber: number, price: number): Promise<string> {
    const versionId = await idFrom(
      `INSERT INTO listing_versions
         (listing_id, version_number, price_per_term_ugx, amenities,
          description, verified_at, verified_by)
       VALUES ($1, $2, $3, '{}'::jsonb, 'Republished version', now(), $4)
       RETURNING id`,
      [listingId, versionNumber, price, opsUserId],
    );
    await pool.query(
      `UPDATE listings SET current_version_id = $1, verified_at = now() WHERE id = $2`,
      [versionId, listingId],
    );
    return versionId;
  }

  async function createRoom(
    propertyId: string,
    label: string,
    capacity: number,
    category: string,
    price: number,
    selfContained: boolean,
  ): Promise<SeedRoom> {
    const unitId = await idFrom(
      `INSERT INTO units
         (property_id, label, capacity, room_category, self_contained, operational_status)
       VALUES ($1, $2, $3, $4::room_category, $5, 'available')
       RETURNING id`,
      [propertyId, label, capacity, category, selfContained],
    );
    await pool.query(
      `INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx)
       VALUES ($1, $2, $3)`,
      [unitId, semesterId, price],
    );
    const bedIds: string[] = [];
    for (let index = 1; index <= capacity; index += 1) {
      bedIds.push(await idFrom(
        `INSERT INTO beds (unit_id, label) VALUES ($1, $2) RETURNING id`,
        [unitId, `Bed ${index}`],
      ));
    }
    return { id: unitId, bedIds };
  }

  async function reserveBed(
    bedId: string,
    listingVersionId: string,
    ownerStudentId: string,
    key: string,
    price: number,
  ): Promise<string> {
    return idFrom(
      `INSERT INTO reservations
         (student_id, bed_id, listing_version_id, status, idempotency_key, price_per_term_ugx)
       VALUES ($1, $2, $3, 'reserved', $4, $5)
       RETURNING id`,
      [ownerStudentId, bedId, listingVersionId, key, price],
    );
  }

  async function createReview(
    listingVersionId: string,
    bedId: string,
    ownerStudentId: string,
    key: string,
    rating: number,
    comment: string | null,
    submittedAt: string,
  ): Promise<void> {
    const reservationId = await idFrom(
      `INSERT INTO reservations
         (student_id, bed_id, listing_version_id, status, idempotency_key, price_per_term_ugx)
       VALUES ($1, $2, $3, 'occupied', $4, 900000)
       RETURNING id`,
      [ownerStudentId, bedId, listingVersionId, key],
    );
    await pool.query(
      `INSERT INTO reviews
         (reservation_id, listing_version_id, student_id, amenity_match,
          overall_rating, comment, submitted_at)
       VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $6)`,
      [reservationId, listingVersionId, ownerStudentId, rating, comment, submittedAt],
    );
  }

  function input(overrides: Record<string, unknown> = {}) {
    return listingSearchPageSchema.parse({
      ...searchBounds,
      university: 'MUK',
      ...overrides,
    });
  }

  function rowFor(page: SearchPage, listingId: string): SearchItem {
    const row = page.items.find((item) => item.id === listingId);
    if (!row) throw new Error(`Listing ${listingId} missing from search page`);
    return row;
  }

  beforeAll(async () => {
    await pool.query(
      `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
       verification_visits, listings, listing_versions, units, beds,
       unit_semester_pricing, reservations, reviews CASCADE`,
    );

    landlordId = await idFrom(
      `INSERT INTO users (phone, role, status, name)
       VALUES ('+256700009901', 'landlord', 'active', 'Search Contract Landlord')
       RETURNING id`,
    );
    await pool.query(
      `INSERT INTO landlords (user_id, legal_name, kyc_status)
       VALUES ($1, 'Search Contract Landlord', 'verified')`,
      [landlordId],
    );
    opsUserId = await idFrom(
      `INSERT INTO users (phone, role, status, name)
       VALUES ('+256700009902', 'ops_lead', 'active', 'Search Contract Ops')
       RETURNING id`,
    );
    await pool.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead')`, [opsUserId]);
    studentId = await idFrom(
      `INSERT INTO users (phone, role, status, name)
       VALUES ('+256700009903', 'student', 'active', 'Search Contract Student')
       RETURNING id`,
    );
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [studentId]);
    secondStudentId = await idFrom(
      `INSERT INTO users (phone, role, status, name)
       VALUES ('+256700009904', 'student', 'active', 'Search Contract Student Two')
       RETURNING id`,
    );
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [secondStudentId]);
    semesterId = await idFrom(
      `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
       VALUES ('Search Contract Semester', '2026-08-01', '2026-12-15', '2026-11-15')
       RETURNING id`,
    );

    const propertyA = await createProperty('Search Alpha', 0.3345, 32.5687);
    searchListingA = await createVerifiedListing(propertyA, 'Search Alpha', 500_000);
    const cheapUnavailable = await createRoom(propertyA, 'Cheap unavailable single', 1, 'single', 100_000, false);
    await reserveBed(cheapUnavailable.bedIds[0]!, searchListingA.versionId, studentId, 'contract-a-cheap', 100_000);
    await createRoom(propertyA, 'Available self-contained singles', 2, 'single', 500_000, true);
    await createRoom(propertyA, 'Available shared doubles', 2, 'double', 700_000, false);

    const propertyB = await createProperty('Search Bravo', 0.3346, 32.5688);
    searchListingB = await createVerifiedListing(propertyB, 'Search Bravo', 300_000);
    await createRoom(propertyB, 'Bravo single', 1, 'single', 300_000, false);

    const propertyC = await createProperty('Search Charlie', 0.337, 32.572);
    searchListingC = await createVerifiedListing(propertyC, 'Search Charlie', 800_000);
    await createRoom(propertyC, 'Charlie single', 1, 'single', 800_000, false);

    const unavailableProperty = await createProperty('Search Unavailable', 0.338, 32.573);
    unavailableListing = await createVerifiedListing(unavailableProperty, 'Search Unavailable', 50_000);
    const unavailableRoom = await createRoom(unavailableProperty, 'Unavailable cheap room', 1, 'single', 50_000, false);
    await reserveBed(unavailableRoom.bedIds[0]!, unavailableListing.versionId, studentId, 'contract-unavailable', 50_000);

    const hiddenProperty = await createProperty('Search Hidden', 0.339, 32.574);
    hiddenListingId = await idFrom(
      `INSERT INTO listings (property_id, semester_id, status)
       VALUES ($1, $2, 'draft') RETURNING id`,
      [hiddenProperty, semesterId],
    );
    await createRoom(hiddenProperty, 'Hidden available room', 1, 'single', 10_000, false);

    const reviewProperty = await createProperty('Reviews Across Versions', 1, 33);
    reviewListing = await createVerifiedListing(reviewProperty, 'Reviews Across Versions', 900_000);
    const reviewVersionTwo = await createListingVersion(reviewListing.id, 2, 950_000);
    const reviewRoom = await createRoom(reviewProperty, 'Review double', 2, 'double', 900_000, false);
    await createReview(
      reviewListing.versionId,
      reviewRoom.bedIds[0]!,
      studentId,
      'contract-review-v1',
      5,
      'The first verified stay was excellent.',
      '2026-10-01T12:00:00Z',
    );
    await createReview(
      reviewVersionTwo,
      reviewRoom.bedIds[1]!,
      secondStudentId,
      'contract-review-v2',
      3,
      null,
      '2026-10-02T12:00:00Z',
    );

    await pool.query(
      `INSERT INTO saved_listings (student_id, listing_id, created_at)
       VALUES ($1, $2, '2026-10-01T10:00:00Z'), ($1, $3, '2026-10-01T11:00:00Z')`,
      [studentId, searchListingA.id, unavailableListing.id],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sorts, paginates, counts and hides unverified or fully unavailable listings', async () => {
    const first = await listings.searchPage(input({ sort: 'price_asc', page: 1, limit: 2 })) as SearchPage;
    const second = await listings.searchPage(input({ sort: 'price_asc', page: 2, limit: 2 })) as SearchPage;
    const descending = await listings.searchPage(input({ sort: 'price_desc', page: 1, limit: 3 })) as SearchPage;
    const distance = await listings.searchPage(input({ sort: 'distance_asc', page: 1, limit: 3 })) as SearchPage;

    expect(first.total).toBe(3);
    expect(first.pageSize).toBe(2);
    expect(first.hasMore).toBe(true);
    expect(first.items.map((item) => item.id)).toEqual([searchListingB.id, searchListingA.id]);
    expect(second.items.map((item) => item.id)).toEqual([searchListingC.id]);
    expect(second.hasMore).toBe(false);
    expect(descending.items.map((item) => item.id)).toEqual([searchListingC.id, searchListingA.id, searchListingB.id]);
    expect(distance.items.map((item) => item.id)).toEqual([searchListingA.id, searchListingB.id, searchListingC.id]);
    expect(first.items.some((item) => item.id === unavailableListing.id)).toBe(false);
    expect(first.items.some((item) => item.id === hiddenListingId)).toBe(false);
  });

  it('derives budget, category, bathroom, counts and display price from the same available beds', async () => {
    const unfiltered = await listings.searchPage(input({ limit: 10 })) as SearchPage;
    const alpha = rowFor(unfiltered, searchListingA.id);
    expect({
      min: Number(alpha.price_per_term_ugx),
      max: Number(alpha.max_price_per_term_ugx),
      beds: Number(alpha.unit_count),
      rooms: Number(alpha.room_count),
    }).toEqual({ min: 500_000, max: 700_000, beds: 4, rooms: 2 });

    const budget = await listings.searchPage(input({ maxPriceUgx: 600_000, limit: 10 })) as SearchPage;
    const budgetAlpha = rowFor(budget, searchListingA.id);
    expect({
      price: Number(budgetAlpha.price_per_term_ugx),
      maxPrice: Number(budgetAlpha.max_price_per_term_ugx),
      beds: Number(budgetAlpha.unit_count),
      categories: budgetAlpha.room_categories,
    }).toEqual({
      price: 500_000,
      maxPrice: 500_000,
      beds: 2,
      categories: [{ category: 'single', price_per_term_ugx: 500_000, unit_count: 2 }],
    });

    const categoryAndBathroom = await listings.searchPage(input({
      minPriceUgx: 600_000,
      maxPriceUgx: 750_000,
      minCapacity: 2,
      roomCategory: 'double',
      selfContained: false,
      limit: 10,
    })) as SearchPage;
    const filteredAlpha = rowFor(categoryAndBathroom, searchListingA.id);
    expect({
      price: Number(filteredAlpha.price_per_term_ugx),
      maxPrice: Number(filteredAlpha.max_price_per_term_ugx),
      beds: Number(filteredAlpha.unit_count),
      rooms: Number(filteredAlpha.room_count),
      categories: filteredAlpha.room_categories,
      selfContained: filteredAlpha.has_self_contained,
    }).toEqual({
      price: 700_000,
      maxPrice: 700_000,
      beds: 2,
      rooms: 1,
      categories: [{ category: 'double', price_per_term_ugx: 700_000, unit_count: 2 }],
      selfContained: false,
    });
  });

  it('enriches saved listings from available beds and keeps an unavailable favourite with zero inventory', async () => {
    const saved = await listings.savedByStudent(studentId) as SearchItem[];
    const available = rowFor({ items: saved, total: saved.length, page: 1, pageSize: saved.length, hasMore: false }, searchListingA.id);
    const unavailable = rowFor({ items: saved, total: saved.length, page: 1, pageSize: saved.length, hasMore: false }, unavailableListing.id);

    expect({
      price: Number(available.price_per_term_ugx),
      maxPrice: Number(available.max_price_per_term_ugx),
      beds: Number(available.unit_count),
      rooms: Number(available.room_count),
      categories: available.room_categories,
    }).toEqual({
      price: 500_000,
      maxPrice: 700_000,
      beds: 4,
      rooms: 2,
      categories: [
        { category: 'single', price_per_term_ugx: 500_000, unit_count: 2 },
        { category: 'double', price_per_term_ugx: 700_000, unit_count: 2 },
      ],
    });
    expect({
      price: Number(unavailable.price_per_term_ugx),
      maxPrice: Number(unavailable.max_price_per_term_ugx),
      beds: Number(unavailable.unit_count),
      rooms: Number(unavailable.room_count),
      minCapacity: unavailable.min_capacity,
      maxCapacity: unavailable.max_capacity,
      categories: unavailable.room_categories,
      selfContained: unavailable.has_self_contained,
    }).toEqual({
      price: 0,
      maxPrice: 0,
      beds: 0,
      rooms: 0,
      minCapacity: null,
      maxCapacity: null,
      categories: [],
      selfContained: false,
    });
  });

  it('aggregates public reviews across verified listing versions, including rating-only reviews without PII', async () => {
    const first = await listings.listingReviews(reviewListing.id, 1, 1) as {
      items: Array<Record<string, unknown>>;
      average: number | null;
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    };
    const second = await listings.listingReviews(reviewListing.id, 2, 1) as typeof first;

    expect(first).toMatchObject({ average: 4, total: 2, page: 1, pageSize: 1, hasMore: true });
    expect(second).toMatchObject({ average: 4, total: 2, page: 2, pageSize: 1, hasMore: false });
    expect(first.items[0]).toMatchObject({ overall_rating: 3, comment: null });
    expect(second.items[0]).toMatchObject({ overall_rating: 5, comment: 'The first verified stay was excellent.' });
    for (const item of [...first.items, ...second.items]) {
      expect(Object.keys(item).sort()).toEqual(['comment', 'id', 'overall_rating', 'submitted_at']);
      expect(item).not.toHaveProperty('student_id');
    }
  });

  it('shows only the landlord first name on a public listing', async () => {
    const detail = await listings.detail(reviewListing.id) as { landlord: { displayName: string } | null };

    expect(detail.landlord?.displayName).toBe('Search');
  });

  it('keeps load-test searches out of the search funnel', async () => {
    const countSearches = async () => Number((await pool.query(
      `SELECT count(*) FROM product_events WHERE event_type = 'search'`,
    )).rows[0].count);
    const before = await countSearches();

    await listings.searchPage(input({ limit: 1 }), { logEvent: false });

    expect(await countSearches()).toBe(before);
  });
});

describe('public listing paging limits', () => {
  it('rejects a paged search beyond page 500', () => {
    expect(listingSearchPageSchema.safeParse({ ...bounds, page: 501 }).success).toBe(false);
  });

  it('rejects a reviews page beyond 500', () => {
    expect(listingReviewsQuerySchema.safeParse({ page: 501 }).success).toBe(false);
  });
});
