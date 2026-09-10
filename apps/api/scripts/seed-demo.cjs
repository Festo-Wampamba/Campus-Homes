const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
// Better Auth's own hasher — so seeded passwords verify against the exact
// same email+password sign-in path real users go through (auth.config.ts),
// not a hand-rolled hash Better Auth wouldn't recognise.
const { hashPassword } = require('better-auth/crypto');

// Full presentation-ready demo dataset — combines seed-dev.cjs's complete
// account roster (every role, so every portal has a real login) with
// Makerere-neighborhood listings (Kikoni/Katanga/Kubiri/Kavule/Kasubi/
// Makerere West/Nakulabye) instead of generic city-wide ones, PLUS
// deliberately incomplete verification states (a scheduled-not-yet-done
// visit, a passed-but-unapproved visit) and a sample inquiry thread — the
// spread of states requested for a walkthrough, not just a pile of
// already-finished listings.
//
// TRUNCATES EVERYTHING — same destructive scope as seed-dev.cjs, explicitly
// requested (2026-08-30) to replace whatever is currently on the target
// database. Confirm DATABASE_URL points at the right place before running.
//
// Usage: DATABASE_URL=<target> node scripts/seed-demo.cjs
// (also wired as `pnpm db:seed:demo`)

const DEV_PASSWORD = 'CampusHomes123!';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const FULL_CHECKLIST = {
  location_gps: { passed: true },
  rooms_capacity: { passed: true },
  amenities: { passed: true },
  photos: { passed: true, notes: 'Placeholder stock photos — replace with real ones before public launch.' },
  landlord_identity: { passed: true },
  safety: { passed: true },
};

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
const CAMPUS_PHOTO_IDS = {
  MUK: '1562774053-701939374585',
  MUBS: '1591123120675-6f7f1aae0e5b',
  KIU: '1607237138185-eedd9c632b0b',
  KYU: '1592280771190-3e2e4d571952',
};
function unsplashUrl(photoId, width = 1200) {
  return `https://images.unsplash.com/photo-${photoId}?w=${width}&q=80&fit=crop`;
}
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
function samplePhotoUrls(seedName, count = 4) {
  const slug = seedName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const offset = hashString(slug) % ROOM_PHOTO_IDS.length;
  return Array.from({ length: count }, (_, i) => unsplashUrl(ROOM_PHOTO_IDS[(offset + i) % ROOM_PHOTO_IDS.length]));
}
function campusPhotoUrl(university) {
  return unsplashUrl(CAMPUS_PHOTO_IDS[university]);
}

const CATEGORY_CAPACITY = { single: 1, double: 2, triple: 3, quad: 4, other: 1 };
const CATEGORY_LABEL = { single: 'Single', double: 'Double', triple: 'Triple', quad: 'Quad', other: 'Room' };
function expandRoomCategories(roomCategories) {
  return roomCategories.flatMap(({ category, count, priceUgx }) =>
    Array.from({ length: count }, (_, i) => ({
      label: `${CATEGORY_LABEL[category]} ${i + 1}`,
      capacity: CATEGORY_CAPACITY[category],
      roomCategory: category,
      priceUgx,
      depositUgx: Math.round((priceUgx * 0.25) / 10000) * 10000,
    })),
  );
}

const ROOM_MIXES = [
  [{ category: 'double', count: 6, priceUgx: 650000 }, { category: 'triple', count: 4, priceUgx: 550000 }],
  [{ category: 'single', count: 5, priceUgx: 950000 }, { category: 'double', count: 3, priceUgx: 1050000 }],
  [{ category: 'single', count: 3, priceUgx: 1200000 }, { category: 'double', count: 2, priceUgx: 1450000 }],
  [{ category: 'triple', count: 8, priceUgx: 450000 }, { category: 'quad', count: 6, priceUgx: 380000 }],
  [{ category: 'single', count: 6, priceUgx: 850000 }],
  [{ category: 'double', count: 10, priceUgx: 500000 }],
  [{ category: 'single', count: 2, priceUgx: 1600000 }, { category: 'double', count: 4, priceUgx: 1300000 }],
  [{ category: 'single', count: 4, priceUgx: 750000 }, { category: 'double', count: 4, priceUgx: 600000 }],
];
const AMENITY_SETS = [
  { water_supply: true, wifi: true, security: true },
  { water_supply: true, power_backup: true, kitchen: true, security: true },
  { self_contained: true, wifi: true, power_backup: true },
  { water_supply: true, security: true, study_room: true },
  { self_contained: true, wifi: true, laundry: true },
  { water_supply: true, power_backup: true, security: true, parking: true },
];

// 15 Makerere-neighborhood properties (2026-08-30 product review) — GPS is
// hand-estimated per neighborhood, not surveyed; correct before this ever
// represents genuine inspected supply.
const MAKERERE_PROPERTIES = [
  { name: 'Kikoni Student Hostel', catchment: 'MUK', streetAddress: 'Kikoni Zone, off Bandali Rise', gpsLat: 0.3291, gpsLon: 32.5638, amenities: { water_supply: true, wifi: true, security: true }, description: 'Shared hostel in Kikoni, walking distance from the Main Gate.', roomCategories: [{ category: 'double', count: 6, priceUgx: 550000 }, { category: 'triple', count: 4, priceUgx: 450000 }] },
  { name: 'Kikoni Palm Court', catchment: 'MUK', streetAddress: 'Kikoni, near Bandali Rise', gpsLat: 0.3282, gpsLon: 32.5652, amenities: { self_contained: true, wifi: true, security: true }, description: 'Self-contained rooms in Kikoni with 24/7 gate security.', roomCategories: [{ category: 'single', count: 4, priceUgx: 850000 }, { category: 'double', count: 4, priceUgx: 600000 }] },
  { name: 'Katanga View Hostel', catchment: 'MUK', streetAddress: 'Katanga Valley', gpsLat: 0.3318, gpsLon: 32.5785, amenities: { water_supply: true, security: true }, description: 'Budget-friendly rooms overlooking Katanga valley, close to campus.', roomCategories: [{ category: 'triple', count: 8, priceUgx: 400000 }, { category: 'quad', count: 4, priceUgx: 350000 }] },
  { name: 'Katanga Valley Residence', catchment: 'MUK', streetAddress: 'Katanga, lower valley road', gpsLat: 0.3308, gpsLon: 32.5795, amenities: { water_supply: true, wifi: true }, description: 'Compact rooms in Katanga with reliable water supply.', roomCategories: [{ category: 'double', count: 8, priceUgx: 480000 }] },
  { name: 'Kubiri Heights', catchment: 'MUK', streetAddress: 'Kubiri Road', gpsLat: 0.3405, gpsLon: 32.5728, amenities: { water_supply: true, power_backup: true, security: true }, description: 'Rooms in Kubiri with backup power and a shared kitchen.', roomCategories: [{ category: 'single', count: 3, priceUgx: 900000 }, { category: 'double', count: 5, priceUgx: 650000 }] },
  { name: 'Kubiri Court', catchment: 'MUK', streetAddress: 'Kubiri Road, off the main junction', gpsLat: 0.3398, gpsLon: 32.5736, amenities: { self_contained: true, wifi: true, security: true }, description: 'Self-contained hostel in Kubiri, short boda ride from campus.', roomCategories: [{ category: 'double', count: 6, priceUgx: 620000 }, { category: 'triple', count: 3, priceUgx: 500000 }] },
  { name: 'Kavule Garden Hostel', catchment: 'MUK', streetAddress: 'Kavule Zone', gpsLat: 0.3406, gpsLon: 32.5598, amenities: { water_supply: true, security: true, parking: true }, description: 'Gated compound in Kavule with parking and a small garden.', roomCategories: [{ category: 'single', count: 4, priceUgx: 800000 }, { category: 'double', count: 6, priceUgx: 550000 }] },
  { name: 'Kavule Residence', catchment: 'MUK', streetAddress: 'Kavule, near the trading centre', gpsLat: 0.3397, gpsLon: 32.5606, amenities: { water_supply: true, wifi: true }, description: 'Simple, budget-friendly rooms in Kavule.', roomCategories: [{ category: 'triple', count: 6, priceUgx: 420000 }, { category: 'quad', count: 4, priceUgx: 360000 }] },
  { name: 'Kasubi Student Lodge', catchment: 'MUK', streetAddress: 'Kasubi, near the tombs road', gpsLat: 0.3483, gpsLon: 32.5536, amenities: { water_supply: true, security: true }, description: 'Quiet lodge in Kasubi, a boda ride from Makerere.', roomCategories: [{ category: 'double', count: 6, priceUgx: 500000 }, { category: 'triple', count: 4, priceUgx: 420000 }] },
  { name: 'Kasubi View Hostel', catchment: 'MUK', streetAddress: 'Kasubi Trading Centre', gpsLat: 0.3476, gpsLon: 32.5545, amenities: { self_contained: true, power_backup: true }, description: 'Self-contained rooms in Kasubi with backup power.', roomCategories: [{ category: 'single', count: 3, priceUgx: 750000 }, { category: 'double', count: 5, priceUgx: 520000 }] },
  { name: 'Makerere West Court', catchment: 'MUK', streetAddress: 'Makerere West, off Sir Apollo Kaggwa Road', gpsLat: 0.3355, gpsLon: 32.5612, amenities: { water_supply: true, wifi: true, security: true }, description: 'Rooms on the west side of campus with fibre wifi.', roomCategories: [{ category: 'single', count: 4, priceUgx: 950000 }, { category: 'double', count: 4, priceUgx: 700000 }] },
  { name: 'Makerere West Residence', catchment: 'MUK', streetAddress: 'Makerere West', gpsLat: 0.3348, gpsLon: 32.5619, amenities: { water_supply: true, security: true, study_room: true }, description: 'Residence with a shared study room, close to the west campus gate.', roomCategories: [{ category: 'double', count: 6, priceUgx: 600000 }, { category: 'triple', count: 3, priceUgx: 480000 }] },
  { name: 'Nakulabye Student Hostel', catchment: 'MUK', streetAddress: 'Nakulabye, Hoima Road', gpsLat: 0.3286, gpsLon: 32.5569, amenities: { water_supply: true, security: true }, description: 'Popular budget hostel in Nakulabye on Hoima Road.', roomCategories: [{ category: 'triple', count: 8, priceUgx: 430000 }, { category: 'quad', count: 4, priceUgx: 370000 }] },
  { name: 'Nakulabye Court', catchment: 'MUK', streetAddress: 'Nakulabye', gpsLat: 0.3279, gpsLon: 32.5577, amenities: { self_contained: true, wifi: true, power_backup: true }, description: 'Self-contained court in Nakulabye with backup power.', roomCategories: [{ category: 'single', count: 4, priceUgx: 880000 }, { category: 'double', count: 4, priceUgx: 620000 }] },
  { name: 'Nakulabye View Lodge', catchment: 'MUK', streetAddress: 'Nakulabye, near the roundabout', gpsLat: 0.3290, gpsLon: 32.5580, amenities: { water_supply: true, wifi: true, security: true }, description: 'Lodge near the Nakulabye roundabout, short boda ride to campus.', roomCategories: [{ category: 'double', count: 5, priceUgx: 580000 }, { category: 'triple', count: 5, priceUgx: 460000 }] },
];

// Other-campus properties (MUBS/KIU/KYU) — same set seed-dev.cjs has always
// used, kept so "browse by university" has real rows for every campus, not
// just MUK.
const OTHER_CAMPUS_PROPERTIES = [
  { name: 'Nakawa Heights', catchment: 'MUBS', streetAddress: 'Nakawa, Jinja Road', gpsLat: 0.3271, gpsLon: 32.6199, amenities: AMENITY_SETS[1], description: 'Self-contained rooms opposite the Nakawa roundabout, generator backup included.', roomCategories: ROOM_MIXES[1] },
  { name: 'Naguru View Hostel', catchment: 'MUBS', streetAddress: 'Naguru Hill', gpsLat: 0.3315, gpsLon: 32.6135, amenities: AMENITY_SETS[2], description: 'Hillside hostel with fibre wifi and a view over Naguru, ten minutes from campus.', roomCategories: ROOM_MIXES[2] },
  { name: 'Bugolobi Residence', catchment: 'MUBS', streetAddress: 'Bugolobi, Butabika Road', gpsLat: 0.3196, gpsLon: 32.6229, amenities: AMENITY_SETS[3], description: 'Residential-estate hostel in Bugolobi with a dedicated study room and 24/7 security.', roomCategories: ROOM_MIXES[0] },
  { name: 'Ntinda Court', catchment: 'MUBS', streetAddress: 'Ntinda, Kira Road', gpsLat: 0.3487, gpsLon: 32.6142, amenities: AMENITY_SETS[4], description: 'Self-contained court in Ntinda with on-site laundry, a boda ride from MUBS.', roomCategories: ROOM_MIXES[4] },
  { name: 'Kansanga Court', catchment: 'KIU', streetAddress: 'Kansanga, Ggaba Road', gpsLat: 0.2802, gpsLon: 32.6122, amenities: AMENITY_SETS[0], description: 'Shared hostel right off Ggaba Road, five minutes from the KIU main gate.', roomCategories: ROOM_MIXES[0] },
  { name: 'Kabalagala Heights', catchment: 'KIU', streetAddress: 'Kabalagala', gpsLat: 0.2867, gpsLon: 32.6034, amenities: AMENITY_SETS[1], description: 'Self-contained rooms in Kabalagala with backup generator and shared kitchen.', roomCategories: ROOM_MIXES[1] },
  { name: 'Muyenga Hillside Hostel', catchment: 'KIU', streetAddress: 'Muyenga Hill', gpsLat: 0.2938, gpsLon: 32.6088, amenities: AMENITY_SETS[3], description: 'Hillside hostel with a reading room and reliable water supply.', roomCategories: ROOM_MIXES[3] },
  { name: 'Lakeview Student Lodge', catchment: 'KIU', streetAddress: 'Ggaba, near the lakeshore', gpsLat: 0.2678, gpsLon: 32.6247, amenities: AMENITY_SETS[2], description: 'Premium self-contained rooms near Ggaba with a view over the lake.', roomCategories: ROOM_MIXES[2] },
  { name: 'Kyambogo Court', catchment: 'KYU', streetAddress: 'Kyambogo, Banda-Kireka Road', gpsLat: 0.3599, gpsLon: 32.6267, amenities: AMENITY_SETS[0], description: 'Shared hostel five minutes from the Kyambogo main gate, with 24/7 security.', roomCategories: ROOM_MIXES[0] },
  { name: 'Kireka Heights', catchment: 'KYU', streetAddress: 'Kireka, Jinja Highway', gpsLat: 0.3555, gpsLon: 32.6455, amenities: AMENITY_SETS[1], description: 'Self-contained rooms in Kireka with backup generator and shared kitchen.', roomCategories: ROOM_MIXES[1] },
  { name: 'Naalya Residence', catchment: 'KYU', streetAddress: 'Naalya', gpsLat: 0.3688, gpsLon: 32.6398, amenities: AMENITY_SETS[2], description: 'Fibre-wired residence in Naalya, a short boda ride from Kyambogo.', roomCategories: ROOM_MIXES[2] },
  { name: 'Namugongo Road Hostel', catchment: 'KYU', streetAddress: 'Namugongo Road', gpsLat: 0.3702, gpsLon: 32.6612, amenities: AMENITY_SETS[0], description: 'Self-contained rooms on Namugongo Road with reliable water supply.', roomCategories: ROOM_MIXES[6] },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      TRUNCATE TABLE users, students, landlords, ops_staff, semesters, properties,
      property_documents, verification_visits, listings, listing_versions,
      units, beds, reservations, reservation_releases, payments, refunds,
      move_ins, audit_log, notifications, inquiries
      CASCADE
    `);

    const studentId = await insertUser(client, { phone: '+256700000001', email: 'student1@campushomes.ug', role: 'student', status: 'active', name: 'Student One' });
    const landlordId = await insertUser(client, { phone: '+256700000002', email: 'landlord1@campushomes.ug', role: 'landlord', status: 'active', name: 'Landlord One' });
    const landlord2Id = await insertUser(client, { phone: '+256700000012', email: 'landlord2@campushomes.ug', role: 'landlord', status: 'active', name: 'Landlord Two' });
    const opsLeadId = await insertUser(client, { phone: '+256700000003', email: 'opslead@campushomes.ug', role: 'ops_lead', status: 'active', name: 'Ops Lead' });
    const inspectorId = await insertUser(client, { phone: '+256700000004', email: 'inspector@campushomes.ug', role: 'ops_inspector', status: 'active', name: 'Inspector One' });
    const adminId = await insertUser(client, { phone: '+256700000005', email: 'festo@campushomes.com', role: 'admin', status: 'active', name: 'Festo' });
    const platformAdminId = await insertUser(client, { phone: '+256700000006', email: 'platformadmin@campushomes.ug', role: 'admin', status: 'active', name: 'Platform Admin' });
    const financeAdminId = await insertUser(client, { phone: '+256700000007', email: 'financeadmin@campushomes.ug', role: 'admin', status: 'active', name: 'Finance Admin' });
    const supportAdminId = await insertUser(client, { phone: '+256700000008', email: 'supportadmin@campushomes.ug', role: 'admin', status: 'active', name: 'Support Admin' });
    const auditorId = await insertUser(client, { phone: '+256700000009', email: 'auditor@campushomes.ug', role: 'admin', status: 'active', name: 'Auditor' });
    const custodianId = await insertUser(client, { phone: '+256700000010', email: 'custodian@campushomes.ug', role: 'custodian', status: 'active', name: 'Custodian One' });
    const propertyWorkerId = await insertUser(client, { phone: '+256700000011', email: 'propertyworker@campushomes.ug', role: 'property_worker', status: 'active', name: 'Property Worker One' });

    for (const userId of [studentId, landlordId, landlord2Id, opsLeadId, inspectorId, platformAdminId, financeAdminId, supportAdminId, auditorId, custodianId, propertyWorkerId]) {
      await insertCredentialAccount(client, userId, DEV_PASSWORD);
    }
    await insertCredentialAccount(client, adminId, 'admin');

    async function assignRole(userId, roleKey, scopeType, scopeId, reason) {
      await client.query(
        `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
         SELECT $1, id, $2, $3, $4, $5 FROM roles WHERE key = $6`,
        [userId, scopeType, scopeId, adminId, reason, roleKey],
      );
    }
    await assignRole(adminId, 'super_admin', 'platform_wide', null, 'Demo super-admin owner');
    await assignRole(platformAdminId, 'platform_admin', 'platform_wide', null, 'Demo RBAC coverage');
    await assignRole(financeAdminId, 'finance_admin', 'platform_wide', null, 'Demo RBAC coverage');
    await assignRole(supportAdminId, 'support_admin', 'platform_wide', null, 'Demo RBAC coverage');
    await assignRole(auditorId, 'auditor', 'platform_wide', null, 'Demo RBAC coverage');
    await assignRole(opsLeadId, 'ops_lead', 'platform_wide', null, 'Demo RBAC coverage');
    await assignRole(inspectorId, 'ops_inspector', 'platform_wide', null, 'Demo RBAC coverage');

    await client.query(`INSERT INTO students (user_id, university, year_of_study) VALUES ($1, 'MUK', 2)`, [studentId]);
    // landlord2 deliberately left kyc_status: 'pending' — the landlord-
    // identity-review queue needs a real row to act on, not just verified ones.
    await client.query(
      `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'Landlord One', 'verified'), ($2, 'Landlord Two Properties Ltd', 'pending')`,
      [landlordId, landlord2Id],
    );
    await client.query(`INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true)`, [opsLeadId, inspectorId]);

    const semesterRes = await client.query(
      `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
       VALUES ('Semester 1 2026/27', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
    );
    const semesterId = semesterRes.rows[0].id;

    const createdListings = [];
    async function createVerifiedListing(spec) {
      const propertyRes = await client.query(
        `INSERT INTO properties (landlord_id, name, street_address, type, status, gps_lat, gps_lon, catchment, amenities)
         VALUES ($1, $2, $3, 'hostel', 'active', $4, $5, $6, $7) RETURNING id`,
        [landlordId, spec.name, spec.streetAddress, spec.gpsLat, spec.gpsLon, spec.catchment, JSON.stringify(spec.amenities)],
      );
      const propertyId = propertyRes.rows[0].id;

      await client.query(
        `INSERT INTO verification_visits (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at, completed_at)
         VALUES ($1, $2, $3, $4, 'passed', $5, now(), now())`,
        [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), `demo-visit-${randomUUID()}`, opsLeadId],
      );

      const listingRes = await client.query(
        `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
        [propertyId, semesterId],
      );
      const listingId = listingRes.rows[0].id;
      const units = expandRoomCategories(spec.roomCategories);
      const startingPriceUgx = Math.min(...units.map((u) => u.priceUgx));

      const versionRes = await client.query(
        `INSERT INTO listing_versions (listing_id, version_number, price_per_term_ugx, amenities, description, verified_at, verified_by)
         VALUES ($1, 1, $2, $3, $4, now(), $5) RETURNING id`,
        [listingId, startingPriceUgx, JSON.stringify(spec.amenities), spec.description, opsLeadId],
      );
      const versionId = versionRes.rows[0].id;

      await client.query(`UPDATE listings SET current_version_id = $1, status = 'verified', verified_at = now() WHERE id = $2`, [versionId, listingId]);

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
          `INSERT INTO listing_photos (listing_version_id, storage_key, captured_by, gps_lat, gps_lon, captured_at, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5, now(), $6, $7)`,
          [versionId, photos[i], inspectorId, spec.gpsLat, spec.gpsLon, i === 0, i],
        );
      }

      createdListings.push({ propertyId, listingId, versionId, name: spec.name });
      return { propertyId, listingId };
    }

    for (const spec of MAKERERE_PROPERTIES) await createVerifiedListing(spec);
    for (const spec of OTHER_CAMPUS_PROPERTIES) await createVerifiedListing(spec);

    // --- Two properties deliberately NOT fully verified, for the ops queue demo ---

    // 1. Visit scheduled, not yet carried out — sits in the "needs visit" state.
    const scheduledPropRes = await client.query(
      `INSERT INTO properties (landlord_id, name, street_address, type, status, gps_lat, gps_lon, catchment, amenities)
       VALUES ($1, 'Wandegeya Junction Hostel', 'Wandegeya, near the taxi park', 'hostel', 'active', 0.3340, 32.5695, 'MUK', $2)
       RETURNING id`,
      [landlordId, JSON.stringify({ water_supply: true, wifi: true })],
    );
    await client.query(
      `INSERT INTO verification_visits (property_id, inspector_id, scheduled_at, checklist, client_idempotency_key, result)
       VALUES ($1, $2, now() + interval '2 days', '{}'::jsonb, $3, 'pending')`,
      [scheduledPropRes.rows[0].id, inspectorId, `demo-visit-scheduled-${randomUUID()}`],
    );

    // 2. Visit completed and passed, but the lead hasn't approved it yet —
    // sits in "properties waiting verification" exactly as a real one would.
    const pendingApprovalPropRes = await client.query(
      `INSERT INTO properties (landlord_id, name, street_address, type, status, gps_lat, gps_lon, catchment, amenities)
       VALUES ($1, 'Bukoto View Hostel', 'Bukoto, off Kira Road', 'hostel', 'active', 0.3452, 32.6023, 'MUK', $2)
       RETURNING id`,
      [landlordId, JSON.stringify({ water_supply: true, security: true, wifi: true })],
    );
    await client.query(
      `INSERT INTO verification_visits (property_id, inspector_id, checklist, client_idempotency_key, result, completed_at)
       VALUES ($1, $2, $3, $4, 'passed', now())`,
      [pendingApprovalPropRes.rows[0].id, inspectorId, JSON.stringify(FULL_CHECKLIST), `demo-visit-unapproved-${randomUUID()}`],
    );

    // --- Sample inquiry thread (student -> landlord, with a reply) ---
    const kikoniListing = createdListings.find((l) => l.name === 'Kikoni Student Hostel');
    if (kikoniListing) {
      await client.query(
        `INSERT INTO inquiries (student_id, category, subject, message, listing_id, landlord_id, landlord_response, landlord_responded_at)
         VALUES ($1, 'listing', $2, $3, $4, $5, $6, now())`,
        [
          studentId,
          'Question — Kikoni Student Hostel',
          "Is the double room still available? I'd like to view it this Saturday afternoon if possible.",
          kikoniListing.listingId,
          landlordId,
          "Yes, it's still available! You're welcome to visit Saturday around 2pm — just confirm here beforehand so I make sure someone's around to show you the room.",
        ],
      );
    }

    // Custodian / property worker attached to the first Makerere property.
    const firstPropertyId = createdListings[0].propertyId;
    await client.query(
      `INSERT INTO property_memberships (user_id, property_id, role, worker_type, assigned_by)
       VALUES ($1, $3, 'custodian', NULL, $4), ($2, $3, 'property_worker', 'cleaner', $4)`,
      [custodianId, propertyWorkerId, firstPropertyId, landlordId],
    );
    await assignRole(custodianId, 'custodian', 'property', firstPropertyId, 'Demo RBAC coverage');
    await assignRole(propertyWorkerId, 'property_worker', 'property', firstPropertyId, 'Demo RBAC coverage');

    for (const uni of ['MUK', 'MUBS', 'KIU', 'KYU']) {
      await client.query(`INSERT INTO campus_photos (university, storage_key, uploaded_by) VALUES ($1, $2, $3)`, [uni, campusPhotoUrl(uni), opsLeadId]);
    }

    await client.query('COMMIT');

    console.log(JSON.stringify({
      ok: true,
      verifiedListings: createdListings.length,
      pendingVisitProperty: 'Wandegeya Junction Hostel',
      pendingApprovalProperty: 'Bukoto View Hostel',
      pendingKycLandlord: 'landlord2@campushomes.ug',
      sampleInquiryOn: kikoniListing ? 'Kikoni Student Hostel' : null,
    }, null, 2));

    console.log(`
Sign in at /sign-in with these accounts (password for everyone except Super Admin: ${DEV_PASSWORD}):

  Student           student1@campushomes.ug       (or phone +256700000001 via OTP)
  Landlord          landlord1@campushomes.ug      (kyc verified — owns all ${createdListings.length} verified listings + the 2 in-progress ones)
  Landlord          landlord2@campushomes.ug      (kyc PENDING — shows in landlord identity review)
  Ops lead          opslead@campushomes.ug        (Wandegeya Junction = needs visit; Bukoto View = passed, awaiting your approval)
  Ops inspector     inspector@campushomes.ug
  Platform Admin    platformadmin@campushomes.ug
  Finance Admin     financeadmin@campushomes.ug
  Support Admin     supportadmin@campushomes.ug
  Auditor           auditor@campushomes.ug
  Custodian         custodian@campushomes.ug
  Property Worker   propertyworker@campushomes.ug
  Super Admin       festo@campushomes.com         (password: admin)

Sample inquiry thread (student1 -> landlord1, with a reply) is on Kikoni Student Hostel.
Phone-OTP also works — OTP codes print to this server's own console (no real SMS sent).
`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertUser(client, { phone, email, role, status, name }) {
  const res = await client.query(
    `INSERT INTO users (phone, email, role, status, name, email_verified) VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [phone, email, role, status, name],
  );
  return res.rows[0].id;
}

async function insertCredentialAccount(client, userId, password) {
  const hash = await hashPassword(password);
  await client.query(
    `INSERT INTO accounts (id, account_id, provider_id, user_id, password) VALUES ($1, $2, 'credential', $3, $4)`,
    [randomUUID(), userId, userId, hash],
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
