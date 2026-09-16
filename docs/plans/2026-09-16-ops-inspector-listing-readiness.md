# Ops Inspector, landlord approval, and listing-readiness plan

## Outcome

CampusHomes will operate one **Ops Lead** and three **Ops Inspectors** through
an invitation-only staff flow. Inspectors collect evidence for properties and
rooms assigned to them; the Ops Lead confirms that evidence and is the only
operations role that can approve a room/photo set for publication. A landlord
cannot operate the landlord workspace until the Super Admin (or a delegated
Ops Lead) accepts the submitted application.

This plan deliberately builds on the foundations already in the codebase:

- `ops_lead` and `ops_inspector` roles, catchment/property scope support, MFA
  gates, `ops_staff`, verification visits, and staff invitations already exist.
- Landlord access is already blocked by `RolesGuard` until `kyc_status` is
  `verified`; the remaining work is to make the applicant details and decision
  history complete and easy to review.
- Room-management change sets and an Ops review page already exist, but the
  listing publication gate must explicitly include approved room and photo
  evidence.

## Roles and separation of duties

| Capability | Super Admin | Ops Lead (1) | Ops Inspector (3) |
| --- | --- | --- | --- |
| Invite, suspend, or revoke staff | Yes | No | No |
| Assign catchment/property scope | Yes | No | No |
| View assigned properties and visits | Yes | Scoped | Scoped/assigned only |
| Create/reassign inspection visits | Yes | Scoped | No |
| Capture checklist, photos, GPS, room evidence | Review only | Review only | Assigned visits only |
| Request corrections | Yes | Scoped | No |
| Approve/reject a visit, room set, or photo set | Yes | Scoped | No |
| Publish/suspend listing | Yes | Scoped | No |
| Manage finance, roles, or platform integrations | Yes | No | No |

The three inspectors should receive **catchment-scoped** assignments initially
(for example MUK, MUBS, and KYU) or narrower property-scoped assignments when
needed. They must never receive platform-wide access by default. The Ops Lead
may have a platform-wide operational assignment, but not Super Admin access.

## Account and invitation lifecycle

1. Super Admin opens **Admin → Staff accounts → Invite staff** and selects
   exactly one role: `ops_lead` or `ops_inspector`, a scope, name, email/phone,
   expiry, and reason.
2. The API creates an `auth_invitations` row plus a provisional role assignment;
   it records delivery attempts and an audit event. Do not create passwords in
   CampusHomes or expose a public staff registration form.
3. The invitee follows a single-use link, signs in or creates their Logto
   identity, verifies email/phone, chooses a password only in Logto, and must
   enrol MFA before staff workspace access is enabled.
4. The API atomically binds the accepted identity to the invitation, activates
   the role assignment, creates/updates the `ops_staff` profile, and records
   who accepted it. Expired, cancelled, already accepted, or mismatched email
   invitations must show a clear recovery path rather than a generic error.
5. On first sign-in, an inspector sees only an empty/assigned-work queue; an
   Ops Lead sees the review queue. Suspended/revoked users are immediately
   denied and their sessions are revoked.
6. Super Admin can resend, cancel, revoke, or change scope. Each action must
   have a reason, notification, and audit record.

## Inspection and publish state machine

Use explicit states rather than booleans. Every transition is server-enforced,
permission-checked, idempotent, and audited.

```text
property/room draft
  -> landlord submitted
  -> visit assigned
  -> inspector in progress
  -> inspector submitted evidence
  -> ops lead: corrections requested --+-> inspector in progress
  -> ops lead: verified rooms + photos
  -> listing ready for publication
  -> published
  -> suspended / re-verification due
```

Publication preconditions:

- The landlord application is approved.
- The property has a passed verification visit approved by an Ops Lead.
- Every included room type has an approved current version, valid price,
  capacity, availability/inventory, and no pending change set.
- Required photos exist, belong to the inspected property/room, have passed
  review, and are not stale or deleted.
- The active semester and catchment are valid.

An Ops Inspector may upload evidence and submit the visit, but cannot mark it
verified or publish it. An Ops Lead can accept, reject, or request correction
with a required explanation. The landlord receives an in-app notification for
each meaningful decision and can see the reason and next action.

## Landlord registration approval experience

The **Landlord accounts** queue should expose both `Pending review` and
`Approved` tabs, with filters, count badges, search, and a row/details drawer.
The drawer should show:

- account identity (name, email/phone, signup time), legal name, business type,
  WhatsApp number, and ID-document presence/link;
- submitted property details, address/catchment, proposed room categories,
  amenities, cover photo, declarations, and submission timestamps;
- KYC/application state, prior decisions/reasons, reviewer, and audit trail;
- **Approve**, **Reject** (reason required), and **Request changes** actions.

After landlord submission, route the applicant to `/landlord/approval-pending`.
Show a clock status, the exact submitted time, what is being reviewed, what is
blocked, and a safe way to amend only if the reviewer requests changes. They
must not reach normal dashboard routes until approval. A rejection must show a
human-readable reason and a deliberate resubmission path.

## Two defects to investigate before implementation

These are symptoms, not assumptions; reproduce each with browser network/API
traces before changing code.

### Room dropdown does not show listings

Trace the selected property/room identifier from the dropdown through the
frontend query key, URL path/query parameters, controller DTO, service query,
and response mapping. Confirm whether the UI expects room **type**, unit, or
bed IDs, and standardise one contract. The endpoint must return only published,
available rooms belonging to the selected property and must expose empty/loading
states instead of silently rendering no options.

### Attachment UUID fetch error

Trace the upload response through storage, attachment persistence, and the
subsequent fetch. The API must return an explicit attachment object
`{ id: UUID, storageKey, contentType, size, status }`; clients must store that
`id` rather than deriving an ID from a URL or storage key. Validate UUIDs at
the controller boundary and return a field-specific 400/404 error, never a 500.
Add correlation IDs to upload/fetch errors and tests for malformed IDs,
unauthorised attachments, deleted attachments, and a successful round trip.

## Property modal UX

The property dialog already uses the large width token. Keep the dialog at
`min(56rem, calc(100vw - 2rem))` on desktop, with a responsive single-column
layout below `sm`, a scrolling body, fixed header/footer, and two-column fields
only when each field remains readable. Test at 320px, 768px, 1024px, and a
standard desktop viewport; no labels, validation errors, file controls, or
submit button may be clipped.

## Delivery order

1. Add structured traces and reproduce the room-dropdown and attachment UUID
   failures; record failing request/response pairs and add failing tests.
2. Complete the staff invitation acceptance lifecycle and idempotency/security
   tests; seed one Ops Lead plus three scoped inspectors in staging.
3. Build staff assignment, visit queue, evidence capture, and Ops Lead review
   screens; enforce all transitions in the API and RLS policies.
4. Add the room/photo verification records and publication gate; backfill or
   classify existing listings safely as review-required, never silently
   published.
5. Complete the landlord review details drawer, pending/approved tabs, decision
   notifications, and applicant pending/rejection screens.
6. Fix the two reproduced data-contract defects, then improve the modal with
   visual regression coverage.
7. Run end-to-end acceptance tests using one Super Admin, one Ops Lead, three
   Inspectors, one landlord, and one student; deploy to staging, observe audit
   and notification events, then promote.

## Acceptance checklist

- A public user cannot self-register as Ops staff or select an Ops role.
- Each invited inspector completes Logto sign-in plus MFA and sees only their
  own assigned scope.
- An inspector can submit room/photo evidence but cannot approve or publish.
- The Ops Lead can request corrections and can publish only after all stated
  preconditions pass.
- Super Admin can see invitation, decision, assignment, and publish audit
  history and revoke access immediately.
- Pending landlords cannot use normal landlord tools; approved landlords can;
  rejected applicants see a reason and a resubmission path.
- The room selector renders valid published inventory, and bad attachment UUIDs
  return actionable validation errors instead of 500s.
- The property modal remains usable and fully visible at all supported widths.

## Implementation prompt for an AI coding agent

```text
Implement the CampusHomes Ops Lead / Ops Inspector workflow described below.
Work in small, independently testable changes. Do not broaden permissions or
weaken RLS to make a test pass. Read the existing migrations, RLS helpers,
role-assignment service, auth invitation flow, verification visits, room
management, listing publication code, and landlord approval implementation
before editing.

Business outcome:
- There is one Ops Lead and three Ops Inspectors, invited only by a Super
  Admin. Staff identity/authentication remains in Logto; CampusHomes stores no
  staff passwords.
- Require MFA for all staff workspaces. Invitations have expiry, resend,
  cancellation, accepted/revoked states, delivery audit data, and are
  idempotent.
- Give the Ops Lead scoped review/publish authority. Give inspectors only
  assigned/catchment-scoped inspection capability. Inspectors can create and
  submit evidence, never approve a visit, room/photo set, or listing.
- A listing can publish only after an approved landlord, an approved Ops Lead
  visit, approved current room data/inventory, and approved required photos.
  Use an explicit server-side state machine and audit every transition.
- Improve landlord account review to show pending and approved tabs plus full
  registration/property details. Pending applicants see a meaningful clock
  status and are blocked from the dashboard; rejection shows a reason and safe
  resubmission path.
- First reproduce and fix: (1) room selector/listing options not appearing and
  (2) attachment UUID fetch failures. Trace each value end-to-end; standardise
  a typed API contract, validate UUIDs at the API boundary, and add regression
  tests. Never derive attachment UUIDs from storage URLs.
- Preserve a property modal width of min(56rem, calc(100vw - 2rem)), responsive
  fields, scrollable body, and accessible fixed actions.

Implementation constraints:
1. Use forward-only SQL migrations, update the migration journal, and retain
   service-role-only RLS policies. Add least-privilege grants only where the
   existing policy still blocks ordinary callers.
2. Make every mutating endpoint validate ownership/scope, use idempotency where
   appropriate, return precise 4xx errors for client data problems, and write
   audit records plus relevant notifications.
3. Add unit tests for guards/state transitions and integration tests for RLS,
   invitation acceptance, inspection submission, lead approval, publication
   denial, room selector data, and attachment upload/fetch round trip.
4. Add end-to-end tests for Super Admin -> invite -> Ops Lead/Inspector MFA ->
   assigned visit -> submitted evidence -> lead approval -> publication, and
   landlord pending -> approved/rejected flows.
5. Run lint, typecheck/build, affected tests, and the relevant browser tests.
   Report exact commands/results, migration names, API routes, UI files,
   remaining risks, and a manual staging verification checklist.

Do not use broad admin permissions as a shortcut, do not accept public staff
signup, do not store credentials in the application database, and do not
publish existing listings without an explicit review decision.
```
