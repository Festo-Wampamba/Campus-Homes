# Landlord tenant booking persistence — 6 November 2026

## Defect and behavior

The previous Existing CampusHomes student intake option creates an acceptance request, not a booking. It deliberately returns the same response for unknown verified contacts. Imported names were only references, so two names entered with one contact did not create two tenancies. No tenant or payment should have been inferred from that response.

Add students now defaults to **Tenant record (new booking or existing resident)**. Imports, including older New/Existing templates, default to this mode. Saving atomically creates property-scoped particulars, a booked reservation and a receipt for any initial amount paid. Booked tenants await move-in; an explicit Already moved in flag records occupied status. Confirm move-in is available from Tenants. Unpaid, Part-paid and Paid in full are shown separately from occupancy.

Private record contacts are never login identifiers. A database constraint forbids phone/email identity keys or a Logto subject on these profiles. Knowing another account's contact cannot attach its identity or expose its data. Explicit account creation and student-accepted room offers remain separate choices. Existing requests are not converted: their imported reference names were not stored and cannot be reliably reconstructed.

Each intake row commits independently, with a stable retry key and payload fingerprint. Replays do not duplicate people, bookings or money; changed data under a committed key is refused. The existing bed locks and unique live-reservation index prevent double booking. Failed booking/payment validation rolls back the private profile. Managed-only properties remain unpublished.

Migration `0088_private_tenant_records` adds contact email, a property-scoped non-login marker and a reservation intake fingerprint. Property deletion cascades private profiles after dependent reservations are removed by the existing purge flow. No existing account/request/booking is rewritten by this migration. Expected migration count: 88.

## Validation

- Applied all migrations to a newly created, disposable local PostGIS database.
- API regression: **126 tests passed** across tenant intake, reservation lifecycle, identity provisioning and tenant document import.
- Frontend: **30 tests passed** across intake forms, room matching and tenant ledger calculations.
- API and web TypeScript/production builds passed; changed-file ESLint and diff whitespace checks passed.
- Real browser → Next.js → Nest API → PostgreSQL checks, using local-only session/landlord/property fixtures, with no mocked write responses:
  - Chromium, 1440px: import an XLSX with two Existing rows and no login contacts; automatic room matching; save one booked and one moved-in tenant; full reload preserves names, rooms, UGX 230,000/30,000 payments and UGX 570,000/770,000 balances on UGX 800,000 rent.
  - Confirm move-in for the booked tenant, reload and verify occupied status.
  - Record a further UGX 50,000, reload and verify cumulative UGX 280,000 paid / UGX 520,000 balance.
  - Firefox, 375px, and WebKit, 768px: manual record with optional contacts blank, save real booking/payment, full reload preserves data.
  - No browser runtime errors. Horizontal table scrolling is confined to the table; phone financial cards span the available width.
- Database assertions cover private-contact isolation from real accounts, verified signup not claiming private profiles, ownership, managed/listed inventory, rollback, concurrent same-key replays, competing bookings, zero payments, receipts and later-payment retries.

Local evidence: `/tmp/ch-tenant-record-api-regression.log`, `/tmp/ch-tenant-record-web-tests.log`, `/tmp/ch-tenant-record-browser-results.json`, `/tmp/ch-tenant-record-{chromium,firefox,webkit}.png`, `/tmp/ch-tenant-record-overflow.png`.

Hosted testing is read-only. No hosted tenant, account, booking or payment test data was created. Production deployment is outside this change.
