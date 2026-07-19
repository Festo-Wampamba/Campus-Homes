const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
// Better Auth's own hasher — so seeded passwords verify against the exact
// same email+password sign-in path real users go through (auth.config.ts),
// not a hand-rolled hash Better Auth wouldn't recognise.
const { hashPassword } = require('better-auth/crypto');

// Every seeded user shares this password so local dev sign-in is trivial to
// remember — never used outside this local/dev seed script.
const DEV_PASSWORD = 'CampusHomes123!';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const FULL_CHECKLIST = {
  location_gps: { passed: true },
  rooms_capacity: { passed: true },
  amenities: { passed: true },
  photos: { passed: true },
  landlord_identity: { passed: true },
  safety: { passed: true },
};

// Hotlinked placeholder photos. loremflickr.com (keyword-matched, previously
// used here) turned out to be unreliable — it started 500ing on every
// request, not just under our seed burst — so these are specific
// images.unsplash.com photo IDs instead: real bedroom/living-room/kitchen
// interiors, hand-picked and verified (each one fetched and eyeballed) so
// listings never show clothes/shoes/unrelated stock again. Unsplash's CDN is
// stable and doesn't need an API key for direct photo-ID fetches. No
// Cloudinary account needed for local dev — lib/cloudinary.ts's
// listingPhotoUrl() passes http(s) storage keys through unchanged instead of
// building a Cloudinary URL.
const ROOM_PHOTO_IDS = [
  '1522771739844-6a9f6d5f14af', // bedroom
  '1505692952047-1a78307da8f2', // bedroom
  '1540518614846-7eded433c457', // bedroom
  '1522708323590-d24dbb6b0267', // apartment living area
  '1484154218962-a197022b5858', // kitchen
  '1493809842364-78817add7ffb', // living room
  '1616486338812-3dadae4b4ace', // living room
  '1595526114035-0d45ed16cfbf', // studio bedroom
  '1567016432779-094069958ea5', // bedroom
];

// One exterior campus-building photo per university tile.
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
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function samplePhotoUrls(seedName, count = 4) {
  const slug = seedName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const offset = hashString(slug) % ROOM_PHOTO_IDS.length;
  return Array.from({ length: count }, (_, i) =>
    unsplashUrl(ROOM_PHOTO_IDS[(offset + i) % ROOM_PHOTO_IDS.length]),
  );
}

function campusPhotoUrl(university) {
  return unsplashUrl(CAMPUS_PHOTO_IDS[university]);
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      TRUNCATE TABLE users, students, landlords, ops_staff, semesters, properties,
      property_documents, verification_visits, listings, listing_versions,
      units, reservations, payments, refunds, move_ins, audit_log, notifications
      CASCADE
    `);

    const studentId = await insertUser(client, {
      phone: '+256700000001',
      email: 'student1@campushomes.ug',
      role: 'student',
      status: 'active',
      name: 'Student One',
    });

    const landlordId = await insertUser(client, {
      phone: '+256700000002',
      email: 'landlord1@campushomes.ug',
      role: 'landlord',
      status: 'active',
      name: 'Landlord One',
    });

    const opsLeadId = await insertUser(client, {
      phone: '+256700000003',
      email: 'opslead@campushomes.ug',
      role: 'ops_lead',
      status: 'active',
      name: 'Ops Lead',
    });

    const inspectorId = await insertUser(client, {
      phone: '+256700000004',
      email: 'inspector@campushomes.ug',
      role: 'ops_inspector',
      status: 'active',
      name: 'Inspector One',
    });

    const adminId = await insertUser(client, {
      phone: '+256700000005',
      email: 'admin@campushomes.ug',
      role: 'admin',
      status: 'active',
      name: 'Admin One',
    });

    // Email+password sign-in for every role, not just staff — same
    // DEV_PASSWORD for all, hashed through Better Auth's own hasher so it
    // verifies against the real emailAndPassword sign-in path
    // (auth.config.ts). Phone-OTP sign-in still works too (dev OTPs print to
    // this server's console — messaging.adapter.ts ConsoleMessaging).
    for (const userId of [studentId, landlordId, opsLeadId, inspectorId, adminId]) {
      await insertCredentialAccount(client, userId, DEV_PASSWORD);
    }

    await client.query(
      `INSERT INTO students (user_id, university, year_of_study) VALUES ($1, 'MUK', 2)`,
      [studentId],
    );

    await client.query(
      `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'Landlord One', 'verified')`,
      [landlordId],
    );

    await client.query(
      `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true)`,
      [opsLeadId, inspectorId],
    );

    const semesterRes = await client.query(
      `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
       VALUES ('Semester 1 2026/27', '2026-08-01', '2026-12-15', '2026-11-15')
       RETURNING id`,
    );
    const semesterId = semesterRes.rows[0].id;

    // Spread across all four real catchments (UNIVERSITIES in shared/enums.ts —
    // 'other' excluded, it's the overflow bucket, not a campus with hostels)
    // so search filters, map bounds, and the landing-page "browse by
    // university" tiles all have real rows for every campus, not just MUK.
    // Room-category default capacities, mirrors apps/web/src/lib/format.ts
    // ROOM_CATEGORY_DEFAULT_CAPACITY — kept in sync by hand since this script
    // runs standalone (no access to the compiled shared package's helpers).
    const CATEGORY_CAPACITY = { single: 1, double: 2, triple: 3, quad: 4, other: 1 };
    const CATEGORY_LABEL = { single: 'Single', double: 'Double', triple: 'Triple', quad: 'Quad', other: 'Room' };

    // Expands { category, count, priceUgx } buckets into individual unit rows
    // — the same "I have 30 singles at 300k" shape the onboarding wizard and
    // Ops publish form collect, just seeded directly here for local dev.
    function expandRoomCategories(roomCategories) {
      return roomCategories.flatMap(({ category, count, priceUgx }) =>
        Array.from({ length: count }, (_, i) => ({
          label: `${CATEGORY_LABEL[category]} ${i + 1}`,
          capacity: CATEGORY_CAPACITY[category],
          roomCategory: category,
          priceUgx,
        })),
      );
    }

    // Cycled across properties (not hand-written per hostel) to keep this
    // list readable at 30 entries — still real variety, just deduplicated.
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

    const PROPERTIES = [
      // --- MUK (Makerere University) — 8 hostels ---
      {
        name: 'Test Hostel',
        catchment: 'MUK',
        streetAddress: 'Wandegeya',
        gpsLat: 0.3336,
        gpsLon: 32.5701,
        amenities: { water: true, power: true },
        description: 'Test listing for local dev',
        roomCategories: [{ category: 'single', count: 1, priceUgx: 800000 }],
      },
      {
        name: 'Kikoni Court',
        catchment: 'MUK',
        streetAddress: 'Kikoni Zone, off Bandali Rise',
        gpsLat: 0.3288,
        gpsLon: 32.5645,
        amenities: AMENITY_SETS[0],
        description:
          'Shared hostel five minutes on foot from the Main Gate, with a reading room and 24/7 gate security.',
        roomCategories: ROOM_MIXES[0],
      },
      {
        name: 'Kubbiri Residences',
        catchment: 'MUK',
        streetAddress: 'Kubbiri Road',
        gpsLat: 0.3402,
        gpsLon: 32.5731,
        amenities: AMENITY_SETS[1],
        description:
          'Self-contained rooms with a backup generator and shared kitchen, a short boda ride from campus.',
        roomCategories: ROOM_MIXES[1],
      },
      {
        name: 'Livingstone View',
        catchment: 'MUK',
        streetAddress: 'Katanga',
        gpsLat: 0.3315,
        gpsLon: 32.5789,
        amenities: AMENITY_SETS[2],
        description: 'Premium self-contained units overlooking Katanga valley, wired for fibre internet.',
        roomCategories: ROOM_MIXES[2],
      },
      {
        name: 'Bwaise Heights',
        catchment: 'MUK',
        streetAddress: 'Bwaise III, Bombo Road',
        gpsLat: 0.3554,
        gpsLon: 32.5555,
        amenities: AMENITY_SETS[3],
        description: 'Budget-friendly rooms in Bwaise with a shared study room and reliable water supply.',
        roomCategories: ROOM_MIXES[3],
      },
      {
        name: 'Nakulabye Lodge',
        catchment: 'MUK',
        streetAddress: 'Nakulabye, Hoima Road',
        gpsLat: 0.3283,
        gpsLon: 32.5573,
        amenities: AMENITY_SETS[4],
        description: 'Quiet self-contained lodge popular with continuing students, on-site laundry.',
        roomCategories: ROOM_MIXES[4],
      },
      {
        name: 'Kavule Gardens',
        catchment: 'MUK',
        streetAddress: 'Kavule Zone',
        gpsLat: 0.3402,
        gpsLon: 32.5601,
        amenities: AMENITY_SETS[5],
        description: 'Gated compound with parking and backup power, a short walk to the Main Gate.',
        roomCategories: ROOM_MIXES[5],
      },
      {
        name: 'Mulago Junction Hostel',
        catchment: 'MUK',
        streetAddress: 'Mulago Hill Road',
        gpsLat: 0.3378,
        gpsLon: 32.5811,
        amenities: AMENITY_SETS[0],
        description: 'Newly built hostel near Mulago roundabout with 24/7 gate security.',
        roomCategories: ROOM_MIXES[6],
      },

      // --- MUBS (Makerere University Business School, Nakawa) — 7 hostels ---
      {
        name: 'Nakawa Heights',
        catchment: 'MUBS',
        streetAddress: 'Nakawa, Jinja Road',
        gpsLat: 0.3271,
        gpsLon: 32.6199,
        amenities: AMENITY_SETS[1],
        description: 'Self-contained rooms opposite the Nakawa roundabout, generator backup included.',
        roomCategories: ROOM_MIXES[1],
      },
      {
        name: 'Naguru View Hostel',
        catchment: 'MUBS',
        streetAddress: 'Naguru Hill',
        gpsLat: 0.3315,
        gpsLon: 32.6135,
        amenities: AMENITY_SETS[2],
        description: 'Hillside hostel with fibre wifi and a view over Naguru, ten minutes from campus.',
        roomCategories: ROOM_MIXES[2],
      },
      {
        name: 'Bugolobi Residence',
        catchment: 'MUBS',
        streetAddress: 'Bugolobi, Butabika Road',
        gpsLat: 0.3196,
        gpsLon: 32.6229,
        amenities: AMENITY_SETS[3],
        description: 'Residential-estate hostel in Bugolobi with a dedicated study room and 24/7 security.',
        roomCategories: ROOM_MIXES[0],
      },
      {
        name: 'Ntinda Court',
        catchment: 'MUBS',
        streetAddress: 'Ntinda, Kira Road',
        gpsLat: 0.3487,
        gpsLon: 32.6142,
        amenities: AMENITY_SETS[4],
        description: 'Self-contained court in Ntinda with on-site laundry, a boda ride from MUBS.',
        roomCategories: ROOM_MIXES[4],
      },
      {
        name: 'Kirinya Road Lodge',
        catchment: 'MUBS',
        streetAddress: 'Kirinya Road',
        gpsLat: 0.3305,
        gpsLon: 32.6255,
        amenities: AMENITY_SETS[5],
        description: 'Gated lodge with parking and backup power, walking distance to Nakawa.',
        roomCategories: ROOM_MIXES[5],
      },
      {
        name: 'Banda Student Village',
        catchment: 'MUBS',
        streetAddress: 'Banda, Kampala–Jinja Highway',
        gpsLat: 0.3402,
        gpsLon: 32.6350,
        amenities: AMENITY_SETS[0],
        description: 'Large budget-friendly compound in Banda with shared kitchens and 24/7 security.',
        roomCategories: ROOM_MIXES[3],
      },
      {
        name: 'Mbuya Hill Hostel',
        catchment: 'MUBS',
        streetAddress: 'Mbuya Hill',
        gpsLat: 0.3225,
        gpsLon: 32.6153,
        amenities: AMENITY_SETS[2],
        description: 'Premium self-contained rooms on Mbuya Hill with fibre internet.',
        roomCategories: ROOM_MIXES[6],
      },

      // --- KIU (Kampala International University, Kansanga) — 8 hostels ---
      {
        name: 'Kansanga Court',
        catchment: 'KIU',
        streetAddress: 'Kansanga, Ggaba Road',
        gpsLat: 0.2802,
        gpsLon: 32.6122,
        amenities: AMENITY_SETS[0],
        description: 'Shared hostel right off Ggaba Road, five minutes from the KIU main gate.',
        roomCategories: ROOM_MIXES[0],
      },
      {
        name: 'Kabalagala Heights',
        catchment: 'KIU',
        streetAddress: 'Kabalagala',
        gpsLat: 0.2867,
        gpsLon: 32.6034,
        amenities: AMENITY_SETS[1],
        description: 'Self-contained rooms in Kabalagala with backup generator and shared kitchen.',
        roomCategories: ROOM_MIXES[1],
      },
      {
        name: 'Ggaba Road Residence',
        catchment: 'KIU',
        streetAddress: 'Ggaba Road',
        gpsLat: 0.2735,
        gpsLon: 32.6198,
        amenities: AMENITY_SETS[2],
        description: 'Fibre-wired residence on Ggaba Road, a short boda ride from campus.',
        roomCategories: ROOM_MIXES[2],
      },
      {
        name: 'Muyenga Hillside Hostel',
        catchment: 'KIU',
        streetAddress: 'Muyenga Hill',
        gpsLat: 0.2938,
        gpsLon: 32.6088,
        amenities: AMENITY_SETS[3],
        description: 'Hillside hostel with a reading room and reliable water supply.',
        roomCategories: ROOM_MIXES[3],
      },
      {
        name: 'Kibuli View',
        catchment: 'KIU',
        streetAddress: 'Kibuli',
        gpsLat: 0.2963,
        gpsLon: 32.5967,
        amenities: AMENITY_SETS[4],
        description: 'Self-contained lodge in Kibuli with on-site laundry.',
        roomCategories: ROOM_MIXES[4],
      },
      {
        name: 'Kansanga Palm Court',
        catchment: 'KIU',
        streetAddress: 'Kansanga, off Ggaba Road',
        gpsLat: 0.2785,
        gpsLon: 32.6145,
        amenities: AMENITY_SETS[5],
        description: 'Gated compound near KIU with parking and backup power.',
        roomCategories: ROOM_MIXES[5],
      },
      {
        name: 'Green Valley Hostel',
        catchment: 'KIU',
        streetAddress: 'Kansanga Valley',
        gpsLat: 0.2820,
        gpsLon: 32.6090,
        amenities: AMENITY_SETS[0],
        description: 'Budget-friendly hostel in the Kansanga valley, walking distance to KIU.',
        roomCategories: ROOM_MIXES[6],
      },
      {
        name: 'Lakeview Student Lodge',
        catchment: 'KIU',
        streetAddress: 'Ggaba, near the lakeshore',
        gpsLat: 0.2678,
        gpsLon: 32.6247,
        amenities: AMENITY_SETS[2],
        description: 'Premium self-contained rooms near Ggaba with a view over the lake.',
        roomCategories: ROOM_MIXES[2],
      },

      // --- KYU (Kyambogo University) — 7 hostels ---
      {
        name: 'Kyambogo Court',
        catchment: 'KYU',
        streetAddress: 'Kyambogo, Banda-Kireka Road',
        gpsLat: 0.3599,
        gpsLon: 32.6267,
        amenities: AMENITY_SETS[0],
        description: 'Shared hostel five minutes from the Kyambogo main gate, with 24/7 security.',
        roomCategories: ROOM_MIXES[0],
      },
      {
        name: 'Kireka Heights',
        catchment: 'KYU',
        streetAddress: 'Kireka, Jinja Highway',
        gpsLat: 0.3555,
        gpsLon: 32.6455,
        amenities: AMENITY_SETS[1],
        description: 'Self-contained rooms in Kireka with backup generator and shared kitchen.',
        roomCategories: ROOM_MIXES[1],
      },
      {
        name: 'Naalya Residence',
        catchment: 'KYU',
        streetAddress: 'Naalya',
        gpsLat: 0.3688,
        gpsLon: 32.6398,
        amenities: AMENITY_SETS[2],
        description: 'Fibre-wired residence in Naalya, a short boda ride from Kyambogo.',
        roomCategories: ROOM_MIXES[2],
      },
      {
        name: 'Bweyogerere Lodge',
        catchment: 'KYU',
        streetAddress: 'Bweyogerere, Kampala–Jinja Highway',
        gpsLat: 0.3778,
        gpsLon: 32.6531,
        amenities: AMENITY_SETS[3],
        description: 'Quiet lodge in Bweyogerere with a dedicated study room.',
        roomCategories: ROOM_MIXES[3],
      },
      {
        name: 'Kasokoso Student Village',
        catchment: 'KYU',
        streetAddress: 'Kasokoso',
        gpsLat: 0.3512,
        gpsLon: 32.6389,
        amenities: AMENITY_SETS[4],
        description: 'Large budget-friendly compound in Kasokoso with on-site laundry.',
        roomCategories: ROOM_MIXES[4],
      },
      {
        name: 'Kyambogo Banda Court',
        catchment: 'KYU',
        streetAddress: 'Banda, near Kyambogo',
        gpsLat: 0.3634,
        gpsLon: 32.6210,
        amenities: AMENITY_SETS[5],
        description: 'Gated compound near Kyambogo with parking and backup power.',
        roomCategories: ROOM_MIXES[5],
      },
      {
        name: 'Namugongo Road Hostel',
        catchment: 'KYU',
        streetAddress: 'Namugongo Road',
        gpsLat: 0.3702,
        gpsLon: 32.6612,
        amenities: AMENITY_SETS[0],
        description: 'Self-contained rooms on Namugongo Road with reliable water supply.',
        roomCategories: ROOM_MIXES[6],
      },
    ];

    const createdListings = [];
    for (const spec of PROPERTIES) {
      const propertyRes = await client.query(
        `INSERT INTO properties (landlord_id, name, street_address, type, status, gps_lat, gps_lon, catchment)
         VALUES ($1, $2, $3, 'hostel', 'active', $4, $5, $6)
         RETURNING id`,
        [landlordId, spec.name, spec.streetAddress, spec.gpsLat, spec.gpsLon, spec.catchment],
      );
      const propertyId = propertyRes.rows[0].id;

      await client.query(
        `INSERT INTO verification_visits (
            property_id, inspector_id, checklist, client_idempotency_key,
            result, approved_by, approved_at, completed_at
          ) VALUES ($1, $2, $3, $4, 'passed', $5, now(), now())`,
        [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), `seed-visit-${randomUUID()}`, opsLeadId],
      );

      const listingRes = await client.query(
        `INSERT INTO listings (property_id, semester_id, status)
         VALUES ($1, $2, 'pending_verification') RETURNING id`,
        [propertyId, semesterId],
      );
      const listingId = listingRes.rows[0].id;
      const units = expandRoomCategories(spec.roomCategories);
      // The listing's headline price is the cheapest room category — computed
      // the same way ops.service.ts publishListing() derives it, never a
      // separately hand-picked number.
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
        `UPDATE listings
         SET current_version_id = $1,
             status = 'verified',
             verified_at = now()
         WHERE id = $2`,
        [versionId, listingId],
      );

      for (const unit of units) {
        await client.query(
          `INSERT INTO units (listing_id, label, capacity, room_category, price_per_term_ugx, available_for_semester_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [listingId, unit.label, unit.capacity, unit.roomCategory, unit.priceUgx, semesterId],
        );
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

      createdListings.push({ propertyId, listingId, versionId, name: spec.name });
    }

    // One tile photo per real catchment — demonstrates the "browse by
    // university" section end-to-end for all four campuses, not just MUK.
    for (const uni of ['MUK', 'MUBS', 'KIU', 'KYU']) {
      await client.query(
        `INSERT INTO campus_photos (university, storage_key, uploaded_by)
         VALUES ($1, $2, $3)`,
        [uni, campusPhotoUrl(uni), opsLeadId],
      );
    }

    await client.query('COMMIT');

    console.log(JSON.stringify({
      ok: true,
      created: {
        studentId,
        landlordId,
        opsLeadId,
        inspectorId,
        adminId,
        semesterId,
        listings: createdListings,
      },
    }, null, 2));

    console.log(`
Sign in at /sign-in with any of these — password is the same for all:

  Password: ${DEV_PASSWORD}

  Student        student1@campushomes.ug     (or phone +256700000001 via OTP)
  Landlord       landlord1@campushomes.ug    (or phone +256700000002 via OTP)
  Ops lead       opslead@campushomes.ug
  Ops inspector  inspector@campushomes.ug
  Admin          admin@campushomes.ug

Phone-OTP still works too — dev OTP codes print to this terminal
(messaging.adapter.ts ConsoleMessaging), no real SMS sent.
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
    `INSERT INTO users (phone, email, role, status, name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [phone, email, role, status, name],
  );

  return res.rows[0].id;
}

// Mirrors exactly what Better Auth's own sign-up route writes on the
// email+password path (linkAccount({ providerId: 'credential', accountId:
// user.id, password: hash })) — so authClient.signIn.email() verifies it
// correctly with no special-casing on the backend.
async function insertCredentialAccount(client, userId, password) {
  const hash = await hashPassword(password);
  await client.query(
    `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
     VALUES ($1, $2, 'credential', $3, $4)`,
    [randomUUID(), userId, userId, hash],
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
