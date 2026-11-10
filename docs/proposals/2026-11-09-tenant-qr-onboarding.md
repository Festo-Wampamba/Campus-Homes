# CampusHomes tenant intake and QR account activation proposal

**Status: approved by Festo 2026-11-10. Existing-resident activation (single-use landlord code) and the two-choice QR page are implemented; system-emailed invitations are not.**
**Prepared: 9 November 2026.**

## Recommended approach

Keep a person's portal account, their accommodation booking, their payments and their physical arrival separate. Scanning a QR code must never record payment, reserve a bed or confirm move-in by itself. A landlord should be able to run a hostel using imported private tenant records before those residents activate a CampusHomes login.

| Dimension | Suggested states | What changes it |
| --- | --- | --- |
| Portal | Not activated; invitation issued; verified and linked; blocked | Verified account creation and an authorized link to the tenant record |
| Accommodation | Interest only; offer awaiting acceptance where applicable; booked awaiting arrival; moved in; released/checked out/cancelled | Explicit booking and arrival actions |
| Payment | Unpaid; partly paid; fully paid; credit/refund due | Posted receipts, allocations, refunds and corrections |
| Room/bed | Available; temporarily held; booked; occupied; blocked | Availability checks and the accommodation/maintenance workflow |

A resident can therefore be **Booked · Part-paid · Portal not activated**, or **Moved in · Part-paid · Portal active**. Account activation does not change either payment or accommodation status.

## Scenario 1: a new student pays before arriving

1. The landlord or authorized property team creates a booking for a particular property, room, bed and semester.
2. They record the money actually received and its method/reference. Separate rent/advance rent, a booking fee and a refundable security deposit; do not automatically count a security deposit as rent paid.
3. Save the resident as **Booked — awaiting move-in**, even if 50% or 100% has been paid. Remove the booked bed from available inventory immediately.
4. The student can scan the property QR or follow an invitation to create/activate their portal. After verification and linking, the portal displays the existing booking, receipts and balance.
5. At actual arrival, an authorized landlord, manager or custodian explicitly confirms move-in and its date. Only this event moves the resident into the occupied count. Keep an audit record of who confirmed arrival.

**Examples:** a UGX 100,000 booking fee without arrival stays booked; UGX 400,000 towards UGX 800,000 rent stays booked with UGX 400,000 outstanding; adding UGX 100,000 security deposit records a separate deposit, not a reduction of the rent balance. The precise fee/refund rules still need your business decision.

If there is no chosen bed yet, record an inquiry or unapplied payment for reconciliation rather than inventing a room allocation. Do not show a room as booked until a valid booking has been saved.

## Scenario 2: importing students already living at a hostel

1. Import the rooms first, using a property-specific template. Review new, updated, unchanged and conflicting rows before saving.
2. Import the existing residents against those rooms and beds. The template should include tenant record ID where already assigned, names, optional student/institution reference, gender, university, room, optional bed, semester, arrival status/date, payment breakdown, payment references, contact details and emergency contact details.
3. Default new booking rows to **Awaiting move-in**. A clearly labelled **Already living here** column is the explicit way to import actual existing occupants. Confirm this choice in the preview so an entire file is not accidentally marked moved in.
4. Create private property tenancy records, not invented login accounts. Missing personal email or phone should not prevent the landlord from capturing an existing resident accurately.
5. Show a completion result per row, preserve successful rows and return a correction file for failed rows. Permit retry without duplicate bookings or payments.

Room codes such as A02 must remain distinct from A2. A requested bed number is a bed label within a room, not a student number or a second room. If a bed is unspecified, choose a free bed only within an unambiguous matched room. If a supplied bed conflicts with inventory, show the actual assignment for confirmation; never silently allocate a different property or room.

## Scenario 3: an imported resident activates their student portal

Offer two clearly named choices after scanning the QR:

- **I already live here / I have a booking:** activate access to an existing tenancy.
- **I am a new applicant:** create an account and start a new inquiry/booking journey.

The QR identifies the property and opens the correct page. It is public information, not proof that a person owns a tenant record. Do not expose a public searchable list of residents, room occupants, balances or emergency contacts.

### Residents with a reliable email or phone already captured

Send a short-lived, single-use activation invitation to that contact. The resident verifies control of it, signs in or creates their account, reviews the minimum required information, and confirms the link. Reuse captured information where appropriate; ask only for missing essentials and any required agreement/consent. Mark the relationship linked without creating another tenancy or another payment.

### Residents with no contact, a shared family contact, or an incorrect contact

The landlord issues a unique invitation/claim code for the specific tenant record after checking the resident in person. The student scans the property QR, enters that code and verifies a personal email or phone. For ambiguous or mismatched cases, require property-team approval before linking. Names, gender, room numbers and a public QR alone are not enough to claim an account.

### Residents who already have a CampusHomes account

Ask them to sign in to that account, verify the invitation and request the existing tenancy link. Keep their verified identity/profile intact. If they already have a portal linked to the record, return them to that portal. Do not create a second student account and do not merge people merely because their names or contact details match.

The implementation should use a separate, auditable account-to-tenancy relationship. The current private records deliberately cannot become sign-in users by simply adding a Logto subject. Account linking needs an explicit approved design and migration, not an email-column rewrite.

## Corrected uploads and duplicates

| Situation | Recommended result |
| --- | --- |
| Same stable record ID, unchanged data | Skip; report unchanged |
| Same ID, changed permitted particulars | Update that record and audit the changed fields |
| Same room code and building in the same property | Match the existing room; review corrections |
| Room renamed or moved between buildings | Use its stable room ID; otherwise request manual reconciliation |
| New record with no match | Create only after validation and availability checks |
| Ambiguous same-name tenants or duplicate room labels across buildings | Show a conflict; do not guess or merge |
| Existing payment differs from spreadsheet total | Reconcile using an explicit payment/adjustment workflow; preserve original receipts |
| A previously uploaded row is absent from the new file | Keep the existing record; an upload must not silently delete data |
| Network retry or repeated upload | Return the prior result or apply the reviewed correction once |
| Bed became occupied or blocked after preview | Revalidate at save and reject that row clearly |

Always scope matching to the authorized property and semester. Stable tenant/booking IDs must not grant access by themselves. Preserve historical semesters, moves, receipts and original import/audit references. Support a duplicate/conflict review queue rather than enforcing unique personal names.

## Landlord experience

Use a simple sequence: **Import rooms → Review inventory → Import residents → Review payments and arrival status → Invite residents to activate their portals**. Provide downloadable Excel/CSV templates with example rows, dropdowns for gender and arrival state, and instructions in the workbook. Show an import summary and downloadable row errors. An initial operational import should not require manually creating fifty student login accounts.

Dashboard totals must explain exactly what they count: booked awaiting arrival, physically moved in, paid towards rent, refundable deposits held and rent outstanding. Updating a profile, scanning a QR, accepting an invitation or recording a payment must not inflate the moved-in count.

## Suggested implementation order after approval

1. Confirm the state/fee definitions and adopt stable IDs in templates and exports.
2. Complete property-scoped import reconciliation with clear previews and payment preservation.
3. Build verified existing-resident activation and account linking, including invitation expiry/revocation and ambiguous-case approval.
4. Add the separate new-applicant QR route, booking/deposit handling and explicit arrival confirmation.
5. Pilot with one existing hostel and a small resident batch before enabling the wider flow.

## Acceptance checks

- QR scanning/account registration changes no occupancy or payment counts.
- A student who pays 50% before arrival is booked and part-paid, not moved in.
- Existing occupants imported with an explicit arrival flag appear as moved in.
- Activating a portal reuses the same tenancy, bed and receipts.
- Re-uploading the same file creates zero additional rooms, tenants, bookings or payments.
- A correction updates only the authorized matching record; another landlord cannot read or alter it.
- A public QR, same name, shared email or room number cannot take over another resident's portal.
- Single-use claims cannot be replayed, and revoked or expired invitations fail safely.
- Concurrent allocations cannot book the same bed twice.
- Payment corrections preserve an audit trail and do not silently overwrite receipts.
- Browser/device layout, keyboard use and accessible error messages work through each step.

## Decisions for your review

Recommended defaults: require an explicit arrival confirmation; keep deposits separate from rent; use private records for operational imports; activate portals through verified, record-specific invitations; route uncertain identity matches to landlord approval. Please review those choices before we implement the QR/account-linking changes.
