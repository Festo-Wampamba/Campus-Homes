# Tenant emergency contacts — 6 November 2026

## Change

Tenant intake now accepts optional emergency-contact name and phone fields. CSV/Excel templates append these as columns N/O, preserving the existing 13 columns and gender dropdowns. The same document-table parser recognizes emergency-contact and next-of-kin headers in Excel, CSV, Word and PDF text tables. Older files remain valid; missing fields can be completed in the review form or after booking.

The Tenants directory offers Add emergency contact or Edit emergency contact for each booked/moved-in tenant. The dialog starts with the current values and saves a booking-specific override. Contacts may be corrected or explicitly cleared. Existing tenant bookings do not need to be re-imported, rebooked or have their payments recorded again.

Migration `0089_tenant_emergency_contacts` adds two nullable reservation columns with bounded lengths. NULL inherits existing student-profile information; blank values intentionally clear that field for this booking. The student's account profile, other bookings, payment totals, bed assignment and move-in state stay intact. Existing rows require no data rewrite. Expected migration count after merge: 89.

The PATCH endpoint accepts only the two emergency-contact fields and requires authenticated landlord access, ownership/booking-management permission and a booked or occupied reservation. It locks the reservation before editing and records an audit event without contact details. Names are length-limited; phone input is normalized and supports local/international digits. Earlier intake retry fingerprints remain stable when emergency fields were omitted.

## Validation

- All migrations applied to a dedicated local PostGIS database.
- API: 33 tests passed across tenant intake/lifecycle, contact updates, ownership, profile isolation, explicit clearing, phone validation and document/template parsing.
- Web: 25 tests passed across emergency-contact editing, intake forms and import mapping.
- Changed-file ESLint, TypeScript and API/web production builds passed.
- Real local browser → Next.js → Nest API → PostgreSQL validation, with no intercepted write responses: import records with/without emergency contacts; add missing details; edit existing details; clear a phone; reload the directory to verify persistence and unchanged payment/balance. Chromium at 1440px, Firefox at 375px and WebKit at 768px. International contact checked in WebKit. No browser runtime errors or page overflow.

Local evidence: `/tmp/ch-emergency-api-tests.log`, `/tmp/ch-emergency-web-tests.log`, `/tmp/ch-emergency-browser-results.json`, `/tmp/ch-emergency-{chromium,firefox,webkit}.png`.

No hosted tenant data or account was edited during validation. This change is submitted as a PR targeting main; staging deployment requires merge. Related tenant-booking/room-matching and responsive changes were already delivered in main before this PR.
