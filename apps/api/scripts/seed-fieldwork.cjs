const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { hashPassword } = require('better-auth/crypto');

// Purpose-built participant roster for the MVP In-Person Testing Workbook's
// moderated rounds and live pilot (§2 table: Round 1/2 = 5-6 students + 3-5
// landlords each; pilot = 30-60 students + 8-12 landlords) — distinct from
// seed-dev.cjs, which is a general local-dev engineering fixture (and
// already seeds 30 verified listings across all four catchments, clearing
// the workbook's "10-15 genuine listings" bar on its own — this script
// depends on that having run, it does not create listings itself).
//
// Additive only, never truncates: safe to run once per round without
// disturbing prior rounds' data. Idempotent per round — re-running with the
// same ROUND just returns the existing accounts instead of erroring or
// duplicating, so it's safe to re-run while prepping.
//
// Deliberately creates BARE accounts — a users row and a credential row,
// nothing else:
//   - No `students` row for student participants. S1-S4 (find/costs/trust/
//     enquire) never touch it — search and the "ask about this place" flow
//     both key off users.id alone. If a session's task reaches "reserve",
//     the real first-time "complete your profile" gate fires exactly as it
//     would for a genuine new student — nothing here short-circuits it.
//   - No `landlords` row and no property for landlord participants.
//     LandlordsService.me() returns null and upsertProfile() does a fresh
//     INSERT for a user with no row (landlords.service.ts) — that IS the
//     onboarding wizard's real entry state. Pre-filling legalName or a
//     property here would turn L1-L3 (add a property, add a room type,
//     prepare for verification) into a no-op instead of the thing being
//     tested.
//
// Usage:
//   ROUND=round1 node --env-file=.env scripts/seed-fieldwork.cjs
//   ROUND=round2 node --env-file=.env scripts/seed-fieldwork.cjs
//   ROUND=pilot STUDENTS=40 LANDLORDS=10 node --env-file=.env scripts/seed-fieldwork.cjs
//
// (also wired as `pnpm db:seed:fieldwork` — ROUND defaults to round1)

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const ROUND = (process.env.ROUND || 'round1').toLowerCase();

// Defaults mirror the workbook's §2 table exactly: 5-6 per moderated round,
// mid-range of the pilot's 30-60 / 8-12. Override with STUDENTS/LANDLORDS
// env vars for a specific pilot headcount.
const ROUND_DEFAULTS = {
  round1: { students: 6, landlords: 5 },
  round2: { students: 6, landlords: 5 },
  pilot: { students: 40, landlords: 10 },
};

if (!ROUND_DEFAULTS[ROUND]) {
  console.error(`Unknown ROUND "${ROUND}" — expected one of: ${Object.keys(ROUND_DEFAULTS).join(', ')}`);
  process.exitCode = 1;
  process.exit();
}

const STUDENT_COUNT = Number(process.env.STUDENTS) || ROUND_DEFAULTS[ROUND].students;
const LANDLORD_COUNT = Number(process.env.LANDLORDS) || ROUND_DEFAULTS[ROUND].landlords;

// Distinct phone/email block per round so Round 1 and Round 2 are guaranteed
// to be different people (the workbook requires "5-6 NEW students + 3-5 NEW
// landlords" for Round 2) and neither collides with seed-dev.cjs's fixed
// +2567000000xx range.
const ROUND_CODE = { round1: '01', round2: '02', pilot: '03' };
const ROUND_LABEL = { round1: 'R1', round2: 'R2', pilot: 'Pilot' };

// A password distinct from seed-dev.cjs's dev password on purpose — this
// one gets printed and handed to an external fieldwork participant, not
// just used by the engineering team locally.
const FIELDWORK_PASSWORD = 'Fieldwork2026!';

// ugPhone (packages/shared/src/common.ts) requires exactly
// /^\+2567\d{8}$/ — a 9-digit national number starting with 7. National
// number here is 7 + 2-digit round code + 1-digit role (1=student,
// 2=landlord) + 5-digit index = 9 digits.
function phone(round, roleDigit, i) {
  return `+2567${ROUND_CODE[round]}${roleDigit}${String(i).padStart(5, '0')}`;
}
function studentPhone(round, i) {
  return phone(round, '1', i);
}
function landlordPhone(round, i) {
  return phone(round, '2', i);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Preconditions: seed-dev.cjs's listings + semester must already exist,
    // or the moderated tasks (search, view, reserve) have nothing real to
    // run against.
    const { rows: listingCount } = await client.query(
      `SELECT count(*)::int AS n FROM listings WHERE status = 'verified'`,
    );
    if (listingCount[0].n < 10) {
      throw new Error(
        `Only ${listingCount[0].n} verified listings exist (need >=10) — run "pnpm db:seed" first.`,
      );
    }

    const students = [];
    for (let i = 1; i <= STUDENT_COUNT; i++) {
      const label = `${ROUND_LABEL[ROUND]} Student ${i}`;
      const email = `${ROUND}-student${i}@campushomes.ug`;
      const phone = studentPhone(ROUND, i);
      const userId = await upsertUser(client, { phone, email, role: 'student', name: label });
      await upsertCredentialAccount(client, userId, FIELDWORK_PASSWORD);
      students.push({ id: userId, label, email, phone });
    }

    const landlords = [];
    for (let i = 1; i <= LANDLORD_COUNT; i++) {
      const label = `${ROUND_LABEL[ROUND]} Landlord ${i}`;
      const email = `${ROUND}-landlord${i}@campushomes.ug`;
      const phone = landlordPhone(ROUND, i);
      const userId = await upsertUser(client, { phone, email, role: 'landlord', name: label });
      await upsertCredentialAccount(client, userId, FIELDWORK_PASSWORD);
      landlords.push({ id: userId, label, email, phone });
    }

    await client.query('COMMIT');

    console.log(JSON.stringify({ ok: true, round: ROUND, students, landlords }, null, 2));
    console.log(printRoster(students, landlords));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function printRoster(students, landlords) {
  const rows = [
    ...students.map((s) => [s.label, 'Student', s.email, s.phone]),
    ...landlords.map((l) => [l.label, 'Landlord', l.email, l.phone]),
  ];
  const table = rows
    .map(([label, role, email, phone]) => `  ${label.padEnd(14)} ${role.padEnd(9)} ${email.padEnd(32)} ${phone}`)
    .join('\n');

  return `
${ROUND_LABEL[ROUND]} fieldwork roster — ${students.length} students, ${landlords.length} landlords
Password for every account: ${FIELDWORK_PASSWORD}

${table}

Two sign-in paths work for every account above — pick whichever the session calls for:
  1. Phone-OTP (recommended — matches the real student/landlord sign-in flow
     participants would actually use): enter the phone number shown, then
     read the OTP off this API server's terminal (dev SMS adapter prints it,
     no real SMS sent).
  2. Email + password (facilitator shortcut, skips the OTP step): use the
     email and the shared password above.

Copy the Label/Email/Phone columns straight into Form 6 (Session Schedule)
and Form 7 (Incentive Register) — keep names/contacts on Form 5 separate
from these research-facing labels per the workbook's privacy controls (§13.1).

Landlord accounts start with NO property and NO landlords-table row — first
sign-in drops them straight into the onboarding wizard (L1-L3). Student
accounts start with NO student profile — the real "complete your profile"
gate fires the first time a session reaches the reserve flow.
`;
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

// Same shape as seed-dev.cjs's helper — mirrors exactly what Better Auth's
// own email+password sign-up route writes, so authClient.signIn.email()
// verifies it with no special-casing.
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
