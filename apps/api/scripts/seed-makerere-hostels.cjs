const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { hashPassword } = require('better-auth/crypto');

// Adds 15 demo hostel listings around Makerere (Kikoni, Katanga, Kubiri,
// Kavule, Kasubi, Makerere West, Nakulabye) to whatever database
// DATABASE_URL points at — additive only, NEVER truncates (unlike
// seed-dev.cjs, which wipes every table and is local-dev-only). Safe to run
// against a database that already has real accounts/data on it.
//
// Placeholder photos (Unsplash, same source + selection approach as
// seed-dev.cjs) so listings look believable for demo/pilot sessions —
// replace with real photos via the landlord portal or Ops publish flow
// before this represents genuine inspected supply.
//
// GPS coordinates are hand-estimated per neighborhood (this script's author
// has not physically visited these properties) — good enough to place a map
// pin in the right area for demo/pilot purposes, but MUST be corrected to
// the real surveyed coordinates before this ever represents genuine
// inspected supply.
//
// Usage: DATABASE_URL=<target> node --env-file=.env scripts/seed-makerere-hostels.cjs
// (also wired as `pnpm db:seed:makerere`)

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const DEMO_LANDLORD = {
  phone: '+256700099001',
  email: 'demo-landlord@campushomes.ug',
  name: 'CampusHomes Demo Properties',
};
// Distinct from seed-dev.cjs's DEV_PASSWORD and seed-fieldwork.cjs's
// FIELDWORK_PASSWORD — this account may sign in on a real deployed
// environment, not just a disposable local DB.
const DEMO_PASSWORD = 'DemoListings2026!';

const FULL_CHECKLIST = {
  location_gps: { passed: true },
  rooms_capacity: { passed: true },
  amenities: { passed: true },
  photos: { passed: true, notes: 'Placeholder stock photos — landlord/ops to replace with real ones before public launch.' },
  landlord_identity: { passed: true },
  safety: { passed: true },
};

const CATEGORY_CAPACITY = { single: 1, double: 2, triple: 3, quad: 4 };
const CATEGORY_LABEL = { single: 'Single', double: 'Double', triple: 'Triple', quad: 'Quad' };

// Real bedroom/living-room/exterior interiors, hand-picked (same set
// seed-dev.cjs uses) so listings never show unrelated stock photos.
const ROOM_PHOTO_IDS = [
  '1522771739844-6a9f6d5f14af',
  '1505692952047-1a78307da8f2',
  '1540518614846-7eded433c457',
  '1522708323590-d24dbb6b0267',
  '1484154218962-a197022b5858',
  '1493809842364-78817add7ffb',
  '1616486338812-3dadae4b4ace',
  '1595526114035-0d45ed16cfbf',
  '1567016432779-094069958ea5',
];

function unsplashUrl(photoId, width = 1200) {
  return `https://images.unsplash.com/photo-${photoId}?w=${width}&q=80&fit=crop`;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function samplePhotoUrls(seedName, count = 4) {
  const offset = hashString(seedName) % ROOM_PHOTO_IDS.length;
  return Array.from({ length: count }, (_, i) => unsplashUrl(ROOM_PHOTO_IDS[(offset + i) % ROOM_PHOTO_IDS.length]));
}

function expandRoomCategories(roomCategories) {
  return roomCategories.flatMap(({ category, count, priceUgx }) =>
    Array.from({ length: count }, (_, i) => ({
      label: `${CATEGORY_LABEL[category]} ${i + 1}`,
      capacity: CATEGORY_CAPACITY[category],
      roomCategory: category,
      priceUgx,
      // Rough deposit convention already used elsewhere in this codebase
      // (~25% of term rent) — see CLAUDE.md's dev-DB deposit backfill note.
      depositUgx: Math.round((priceUgx * 0.25) / 10000) * 10000,
    })),
  );
}

// 15 properties across the 7 requested Makerere-area neighborhoods
// (2 each, 3 for Nakulabye = 15). All catchment: MUK.
const PROPERTIES = [
  {
    name: 'Kikoni Student Hostel',
    streetAddress: 'Kikoni Zone, off Bandali Rise',
    gpsLat: 0.3291, gpsLon: 32.5638,
    amenities: { water_supply: true, wifi: true, security: true },
    description: 'Shared hostel in Kikoni, walking distance from the Main Gate.',
    roomCategories: [{ category: 'double', count: 6, priceUgx: 550000 }, { category: 'triple', count: 4, priceUgx: 450000 }],
  },
  {
    name: 'Kikoni Palm Court',
    streetAddress: 'Kikoni, near Bandali Rise',
    gpsLat: 0.3282, gpsLon: 32.5652,
    amenities: { self_contained: true, wifi: true, security: true },
    description: 'Self-contained rooms in Kikoni with 24/7 gate security.',
    roomCategories: [{ category: 'single', count: 4, priceUgx: 850000 }, { category: 'double', count: 4, priceUgx: 600000 }],
  },
  {
    name: 'Katanga View Hostel',
    streetAddress: 'Katanga Valley',
    gpsLat: 0.3318, gpsLon: 32.5785,
    amenities: { water_supply: true, security: true },
    description: 'Budget-friendly rooms overlooking Katanga valley, close to campus.',
    roomCategories: [{ category: 'triple', count: 8, priceUgx: 400000 }, { category: 'quad', count: 4, priceUgx: 350000 }],
  },
  {
    name: 'Katanga Valley Residence',
    streetAddress: 'Katanga, lower valley road',
    gpsLat: 0.3308, gpsLon: 32.5795,
    amenities: { water_supply: true, wifi: true },
    description: 'Compact rooms in Katanga with reliable water supply.',
    roomCategories: [{ category: 'double', count: 8, priceUgx: 480000 }],
  },
  {
    name: 'Kubiri Heights',
    streetAddress: 'Kubiri Road',
    gpsLat: 0.3405, gpsLon: 32.5728,
    amenities: { water_supply: true, power_backup: true, security: true },
    description: 'Rooms in Kubiri with backup power and a shared kitchen.',
    roomCategories: [{ category: 'single', count: 3, priceUgx: 900000 }, { category: 'double', count: 5, priceUgx: 650000 }],
  },
  {
    name: 'Kubiri Court',
    streetAddress: 'Kubiri Road, off the main junction',
    gpsLat: 0.3398, gpsLon: 32.5736,
    amenities: { self_contained: true, wifi: true, security: true },
    description: 'Self-contained hostel in Kubiri, short boda ride from campus.',
    roomCategories: [{ category: 'double', count: 6, priceUgx: 620000 }, { category: 'triple', count: 3, priceUgx: 500000 }],
  },
  {
    name: 'Kavule Garden Hostel',
    streetAddress: 'Kavule Zone',
    gpsLat: 0.3406, gpsLon: 32.5598,
    amenities: { water_supply: true, security: true, parking: true },
    description: 'Gated compound in Kavule with parking and a small garden.',
    roomCategories: [{ category: 'single', count: 4, priceUgx: 800000 }, { category: 'double', count: 6, priceUgx: 550000 }],
  },
  {
    name: 'Kavule Residence',
    streetAddress: 'Kavule, near the trading centre',
    gpsLat: 0.3397, gpsLon: 32.5606,
    amenities: { water_supply: true, wifi: true },
    description: 'Simple, budget-friendly rooms in Kavule.',
    roomCategories: [{ category: 'triple', count: 6, priceUgx: 420000 }, { category: 'quad', count: 4, priceUgx: 360000 }],
  },
  {
    name: 'Kasubi Student Lodge',
    streetAddress: 'Kasubi, near the tombs road',
    gpsLat: 0.3483, gpsLon: 32.5536,
    amenities: { water_supply: true, security: true },
    description: 'Quiet lodge in Kasubi, a boda ride from Makerere.',
    roomCategories: [{ category: 'double', count: 6, priceUgx: 500000 }, { category: 'triple', count: 4, priceUgx: 420000 }],
  },
  {
    name: 'Kasubi View Hostel',
    streetAddress: 'Kasubi Trading Centre',
    gpsLat: 0.3476, gpsLon: 32.5545,
    amenities: { self_contained: true, power_backup: true },
    description: 'Self-contained rooms in Kasubi with backup power.',
    roomCategories: [{ category: 'single', count: 3, priceUgx: 750000 }, { category: 'double', count: 5, priceUgx: 520000 }],
  },
  {
    name: 'Makerere West Court',
    streetAddress: 'Makerere West, off Sir Apollo Kaggwa Road',
    gpsLat: 0.3355, gpsLon: 32.5612,
    amenities: { water_supply: true, wifi: true, security: true },
    description: 'Rooms on the west side of campus with fibre wifi.',
    roomCategories: [{ category: 'single', count: 4, priceUgx: 950000 }, { category: 'double', count: 4, priceUgx: 700000 }],
  },
  {
    name: 'Makerere West Residence',
    streetAddress: 'Makerere West',
    gpsLat: 0.3348, gpsLon: 32.5619,
    amenities: { water_supply: true, security: true, study_room: true },
    description: 'Residence with a shared study room, close to the west campus gate.',
    roomCategories: [{ category: 'double', count: 6, priceUgx: 600000 }, { category: 'triple', count: 3, priceUgx: 480000 }],
  },
  {
    name: 'Nakulabye Student Hostel',
    streetAddress: 'Nakulabye, Hoima Road',
    gpsLat: 0.3286, gpsLon: 32.5569,
    amenities: { water_supply: true, security: true },
    description: 'Popular budget hostel in Nakulabye on Hoima Road.',
    roomCategories: [{ category: 'triple', count: 8, priceUgx: 430000 }, { category: 'quad', count: 4, priceUgx: 370000 }],
  },
  {
    name: 'Nakulabye Court',
    streetAddress: 'Nakulabye',
    gpsLat: 0.3279, gpsLon: 32.5577,
    amenities: { self_contained: true, wifi: true, power_backup: true },
    description: 'Self-contained court in Nakulabye with backup power.',
    roomCategories: [{ category: 'single', count: 4, priceUgx: 880000 }, { category: 'double', count: 4, priceUgx: 620000 }],
  },
  {
    name: 'Nakulabye View Lodge',
    streetAddress: 'Nakulabye, near the roundabout',
    gpsLat: 0.3290, gpsLon: 32.5580,
    amenities: { water_supply: true, wifi: true, security: true },
    description: 'Lodge near the Nakulabye roundabout, short boda ride to campus.',
    roomCategories: [{ category: 'double', count: 5, priceUgx: 580000 }, { category: 'triple', count: 5, priceUgx: 460000 }],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inspectorRes = await client.query(
      `SELECT id FROM users WHERE role = 'ops_inspector' ORDER BY created_at ASC LIMIT 1`,
    );
    const leadRes = await client.query(
      `SELECT id FROM users WHERE role = 'ops_lead' ORDER BY created_at ASC LIMIT 1`,
    );
    if (!inspectorRes.rows[0] || !leadRes.rows[0]) {
      throw new Error(
        'No ops_inspector / ops_lead account found on this database — refusing to fabricate one. ' +
        'Seed or invite real ops staff first.',
      );
    }
    const inspectorId = inspectorRes.rows[0].id;
    const opsLeadId = leadRes.rows[0].id;

    const semesterRes = await client.query(
      `SELECT id FROM semesters
       WHERE (university = 'MUK' OR university IS NULL) AND archived_at IS NULL
       ORDER BY starts_on DESC LIMIT 1`,
    );
    if (!semesterRes.rows[0]) {
      throw new Error('No active MUK (or catchment-agnostic) semester found — create one before running this.');
    }
    const semesterId = semesterRes.rows[0].id;

    const landlordId = await upsertUser(client, {
      phone: DEMO_LANDLORD.phone,
      email: DEMO_LANDLORD.email,
      role: 'landlord',
      name: DEMO_LANDLORD.name,
    });
    await upsertCredentialAccount(client, landlordId, DEMO_PASSWORD);
    await client.query(
      `INSERT INTO landlords (user_id, legal_name, kyc_status)
       VALUES ($1, $2, 'verified')
       ON CONFLICT (user_id) DO NOTHING`,
      [landlordId, DEMO_LANDLORD.name],
    );

    const createdListings = [];
    const skipped = [];
    for (const spec of PROPERTIES) {
      const existing = await client.query(
        `SELECT id FROM properties WHERE landlord_id = $1 AND name = $2`,
        [landlordId, spec.name],
      );
      if (existing.rows[0]) {
        skipped.push(spec.name);
        continue;
      }

      const propertyRes = await client.query(
        `INSERT INTO properties (landlord_id, name, street_address, type, status, gps_lat, gps_lon, catchment, amenities)
         VALUES ($1, $2, $3, 'hostel', 'active', $4, $5, 'MUK', $6)
         RETURNING id`,
        [landlordId, spec.name, spec.streetAddress, spec.gpsLat, spec.gpsLon, JSON.stringify(spec.amenities)],
      );
      const propertyId = propertyRes.rows[0].id;

      await client.query(
        `INSERT INTO verification_visits (
            property_id, inspector_id, checklist, client_idempotency_key,
            result, approved_by, approved_at, completed_at
          ) VALUES ($1, $2, $3, $4, 'passed', $5, now(), now())`,
        [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), `makerere-demo-${randomUUID()}`, opsLeadId],
      );

      const listingRes = await client.query(
        `INSERT INTO listings (property_id, semester_id, status)
         VALUES ($1, $2, 'pending_verification') RETURNING id`,
        [propertyId, semesterId],
      );
      const listingId = listingRes.rows[0].id;
      const units = expandRoomCategories(spec.roomCategories);
      const startingPriceUgx = Math.min(...units.map((u) => u.priceUgx));

      const versionRes = await client.query(
        `INSERT INTO listing_versions (
            listing_id, version_number, price_per_term_ugx, amenities,
            description, verified_at, verified_by
          ) VALUES ($1, 1, $2, $3, $4, now(), $5) RETURNING id`,
        [listingId, startingPriceUgx, JSON.stringify(spec.amenities), spec.description, opsLeadId],
      );
      const versionId = versionRes.rows[0].id;

      await client.query(
        `UPDATE listings SET current_version_id = $1, status = 'verified', verified_at = now() WHERE id = $2`,
        [versionId, listingId],
      );

      for (const unit of units) {
        // Rooms are permanent/property-level (2026-09) — price lives in
        // unit_semester_pricing, not on the unit itself.
        const unitRes = await client.query(
          `INSERT INTO units (property_id, label, capacity, room_category)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [propertyId, unit.label, unit.capacity, unit.roomCategory],
        );
        const unitId = unitRes.rows[0].id;
        await client.query(
          `INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx, deposit_ugx) VALUES ($1, $2, $3, $4)`,
          [unitId, semesterId, unit.priceUgx, unit.depositUgx],
        );
        // Bed-level inventory (2026-09 redesign) — every unit needs its
        // capacity's worth of beds or it's seeded entirely unreservable.
        for (let i = 1; i <= unit.capacity; i++) {
          await client.query(`INSERT INTO beds (unit_id, label) VALUES ($1, $2)`, [unitId, `Bed ${i}`]);
        }
      }

      const photos = samplePhotoUrls(spec.name);
      for (let i = 0; i < photos.length; i++) {
        await client.query(
          `INSERT INTO listing_photos (
              listing_version_id, storage_key, captured_by, gps_lat, gps_lon, captured_at, is_primary, sort_order
            ) VALUES ($1, $2, $3, $4, $5, now(), $6, $7)`,
          [versionId, photos[i], inspectorId, spec.gpsLat, spec.gpsLon, i === 0, i],
        );
      }

      createdListings.push({ propertyId, listingId, versionId, name: spec.name, units: units.length, photos: photos.length });
    }

    await client.query('COMMIT');

    console.log(JSON.stringify({ ok: true, landlordId, semesterId, created: createdListings, skipped }, null, 2));
    console.log(`
Created ${createdListings.length} listings (${skipped.length ? `skipped ${skipped.length} already present: ${skipped.join(', ')}` : 'none skipped'}).
Photos are stock placeholders (Unsplash) — replace with real photos via the landlord portal or Ops publish flow before treating these as launch-ready.

Demo landlord sign-in:
  Email    ${DEMO_LANDLORD.email}
  Password ${DEMO_PASSWORD}
  Phone    ${DEMO_LANDLORD.phone} (OTP)
`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function upsertUser(client, { phone, email, role, name }) {
  const existing = await client.query(`SELECT id FROM users WHERE phone = $1 OR email = $2`, [phone, email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const res = await client.query(
    `INSERT INTO users (phone, email, role, status, name, email_verified, phone_verified)
     VALUES ($1, $2, $3, 'active', $4, true, true)
     RETURNING id`,
    [phone, email, role, name],
  );
  return res.rows[0].id;
}

async function upsertCredentialAccount(client, userId, password) {
  const existing = await client.query(
    `SELECT id FROM accounts WHERE user_id = $1 AND provider_id = 'credential'`,
    [userId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const hash = await hashPassword(password);
  const res = await client.query(
    `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
     VALUES ($1, $2, 'credential', $3, $4) RETURNING id`,
    [randomUUID(), userId, userId, hash],
  );
  return res.rows[0].id;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
