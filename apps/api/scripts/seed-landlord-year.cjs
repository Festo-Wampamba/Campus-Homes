const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

// Adds a full year of realistic historical activity on top of what
// seed-dev.cjs already created — does NOT truncate anything, so it's safe
// to run after seed-dev.cjs on the same local DB. Purpose: local-dev-only
// data so the landlord (and admin finance/reports, which read the same
// tables) analytics pages have real volume to chart instead of an empty
// state. Every number charted from this data is a real row — nothing is
// pre-aggregated or invented at render time.
//
// Reuses the single existing student (student1@campushomes.ug) as the
// tenant on every seeded reservation rather than fabricating dozens of new
// student accounts — deliberate simplification for a local seed script, not
// something ever presented as "many distinct real tenants."
//
// Known simplification: all reservations reuse the one listing_version /
// semester seed-dev.cjs already created, even for dates outside that
// semester's date range. Nothing in the schema enforces the two agree, and
// no UI surfaces the mismatch — modelling a full year of real semester
// turnover (separate listings per semester) is out of scope for what this
// script is for (populating charts), so it's intentionally skipped.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const RESERVATION_FEE_UGX = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PAYMENT_METHOD_WEIGHTS = [
  ['mtn_momo', 0.6],
  ['airtel_money', 0.25],
  ['card', 0.1],
  ['bank_transfer', 0.05],
];

const REVIEW_COMMENTS = [
  'Quiet compound, water never went off the whole semester. Would rent here again.',
  'Landlord was responsive whenever something needed fixing. Good value for the price.',
  'Room was exactly as described on the listing — no surprises on move-in day.',
  'Security guard at the gate every night, felt safe walking in late from the library.',
  'Power backup actually works during outages, unlike my last hostel.',
  'A bit far from the main gate but the boda stage is right outside.',
  'Shared kitchen gets busy in the evenings but otherwise a solid stay.',
  'Wifi was patchy in some rooms — worth asking which room before booking.',
];

function weightedPick(weights) {
  const r = Math.random();
  let cumulative = 0;
  for (const [value, weight] of weights) {
    cumulative += weight;
    if (r <= cumulative) return value;
  }
  return weights[weights.length - 1][0];
}

function daysAgo(n) {
  return new Date(Date.now() - n * DAY_MS);
}

function randomDateBetween(daysAgoMax, daysAgoMin) {
  const span = daysAgoMax - daysAgoMin;
  const offset = daysAgoMin + Math.random() * span;
  return daysAgo(offset);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: landlordRows } = await client.query(
      `SELECT id FROM users WHERE email = 'landlord1@campushomes.ug'`,
    );
    const { rows: studentRows } = await client.query(
      `SELECT id FROM users WHERE email = 'student1@campushomes.ug'`,
    );
    if (!landlordRows[0] || !studentRows[0]) {
      throw new Error('Run pnpm db:seed first — landlord1/student1 not found.');
    }
    const landlordId = landlordRows[0].id;
    const studentId = studentRows[0].id;

    // Rooms are permanent/property-level (2026-09) — price comes from
    // unit_semester_pricing, joined to whichever of the property's listings
    // covers that same semester.
    const { rows: units } = await client.query(
      `SELECT u.id AS unit_id, usp.price_per_term_ugx, l.current_version_id
       FROM units u
       JOIN unit_semester_pricing usp ON usp.unit_id = u.id
       JOIN listings l ON l.property_id = u.property_id AND l.semester_id = usp.semester_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.landlord_id = $1 AND l.current_version_id IS NOT NULL`,
      [landlordId],
    );
    if (units.length === 0) {
      throw new Error('landlord1 has no published units — run pnpm db:seed first.');
    }

    let reservationsCreated = 0;
    let paymentsCreated = 0;
    let moveInsCreated = 0;
    let reviewsCreated = 0;
    let refundsCreated = 0;

    for (const unit of units) {
      const outcome = weightedPick([
        ['occupied', 0.6],
        ['available', 0.25],
        ['in_progress', 0.15],
      ]);

      // 0-2 earlier historical bookings — never fulfilled/held/payment_pending
      // for an "available" unit (those statuses would make it look
      // currently occupied — see listings.service.ts LIVE_RESERVATION_STATUSES),
      // any mix otherwise. These exist purely to give the bookings-trend
      // chart real volume across the whole year, not to set current state.
      const earlierCount = Math.floor(Math.random() * 3);
      const earlierStatusPool =
        outcome === 'available'
          ? ['cancelled', 'expired']
          : ['fulfilled', 'cancelled', 'expired', 'refunded'];

      const bookings = [];
      for (let i = 0; i < earlierCount; i++) {
        bookings.push({
          status: earlierStatusPool[Math.floor(Math.random() * earlierStatusPool.length)],
          createdAt: randomDateBetween(360, 40),
        });
      }

      if (outcome === 'occupied') {
        bookings.push({ status: 'fulfilled', createdAt: randomDateBetween(240, 14) });
      } else if (outcome === 'in_progress') {
        bookings.push({
          status: Math.random() < 0.7 ? 'held' : 'payment_pending',
          createdAt: randomDateBetween(5, 0),
        });
      }
      // 'available' units get zero or more non-live earlier bookings only —
      // nothing appended here, so no live status lingers.

      bookings.sort((a, b) => a.createdAt - b.createdAt);

      for (const booking of bookings) {
        const reservationId = randomUUID();
        const holdExpiresAt =
          booking.status === 'held' ? new Date(booking.createdAt.getTime() + 3 * DAY_MS) : null;

        await client.query(
          `INSERT INTO reservations (
              id, student_id, unit_id, listing_version_id, status, fee_amount_ugx,
              hold_starts_at, hold_expires_at, idempotency_key, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
          [
            reservationId,
            studentId,
            unit.unit_id,
            unit.current_version_id,
            booking.status,
            RESERVATION_FEE_UGX,
            booking.createdAt,
            holdExpiresAt,
            `seed-year-${randomUUID()}`,
            booking.createdAt,
          ],
        );
        reservationsCreated++;

        const paid = ['fulfilled', 'refunded'].includes(booking.status);
        let paymentId = null;
        if (paid) {
          paymentId = randomUUID();
          const verifiedAt = new Date(booking.createdAt.getTime() + 15 * 60 * 1000);
          await client.query(
            `INSERT INTO payments (
                id, reservation_id, provider, provider_txn_id, provider_ref, amount_ugx,
                currency, payment_method, status, webhook_verified, created_at, verified_at
              ) VALUES ($1, $2, 'flutterwave', $3, $4, $5, 'UGX', $6, 'succeeded', true, $7, $8)`,
            [
              paymentId,
              reservationId,
              `seed-year-txn-${randomUUID()}`,
              `seed-year-ref-${randomUUID()}`,
              RESERVATION_FEE_UGX,
              weightedPick(PAYMENT_METHOD_WEIGHTS),
              booking.createdAt,
              verifiedAt,
            ],
          );
          paymentsCreated++;
        }

        if (booking.status === 'refunded' && paymentId) {
          await client.query(
            `INSERT INTO refunds (id, payment_id, reservation_id, reason, amount_ugx, status, processed_at, created_at)
             VALUES ($1, $2, $3, 'cooling_off', $4, 'processed', $5, $5)`,
            [
              randomUUID(),
              paymentId,
              reservationId,
              RESERVATION_FEE_UGX,
              new Date(booking.createdAt.getTime() + 2 * DAY_MS),
            ],
          );
          refundsCreated++;
        }

        if (booking.status === 'fulfilled') {
          const confirmedAt = new Date(booking.createdAt.getTime() + 3 * DAY_MS);
          await client.query(
            `INSERT INTO move_ins (id, reservation_id, confirmed_at, confirmed_by_role, no_show, created_at)
             VALUES ($1, $2, $3, $4, false, $3)`,
            [randomUUID(), reservationId, confirmedAt, Math.random() < 0.7 ? 'student' : 'landlord'],
          );
          moveInsCreated++;

          // Not every stay gets a review — ~35% do, same order of magnitude
          // as real review response rates.
          if (Math.random() < 0.35) {
            await client.query(
              `INSERT INTO reviews (id, reservation_id, listing_version_id, student_id, amenity_match, overall_rating, comment, submitted_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                randomUUID(),
                reservationId,
                unit.current_version_id,
                studentId,
                JSON.stringify({ water_supply: true, security: true, wifi: Math.random() < 0.7 }),
                3 + Math.floor(Math.random() * 3), // 3-5 stars — no seeded 1-2 star reviews
                REVIEW_COMMENTS[Math.floor(Math.random() * REVIEW_COMMENTS.length)],
                new Date(confirmedAt.getTime() + 7 * DAY_MS),
              ],
            );
            reviewsCreated++;
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          unitsConsidered: units.length,
          reservationsCreated,
          paymentsCreated,
          moveInsCreated,
          reviewsCreated,
          refundsCreated,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
