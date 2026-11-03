# Leadership and delegated property management

Role release prepared on 3 November 2026. This document describes the delivered access boundaries; deployment status is verified separately through the release pipeline.

## Role map

| Role | Home | Default authority |
| --- | --- | --- |
| Director (`director`) | `/admin/leadership` | Aggregate performance, financial reports, decision requests and independent decision approval |
| General Manager (`general_manager`) | `/admin/leadership` | Operational oversight, department activities, inquiries, reservation/payment reads, office supervision and decision requests |
| Office Administrator / Front Desk (`office_admin`) | `/admin/front-desk` | Case intake, appointments, follow-ups and escalation within the caller's catchment and case assignment |
| Property Manager (`property_manager`) | `/management` | Property access only through an accepted, current owner mandate and individual assignment |

Company roles map to the existing administrative identity but cannot satisfy broad legacy `@Roles('admin')` routes: those remain restricted to platform administrators. Staff require provider-verified MFA. Director/General Manager grants, revocations, sensitive account edits and deletion require Super Admin tier authority. Director assignments are platform-wide. Scoped General Managers receive the new scope-aware leadership and office surfaces; legacy unrestricted endpoints fail closed for scoped grants.

Staff and customer accounts remain separate. Property Manager is a distinct database identity and does not satisfy landlord-only guards. Agency membership grants neither property access nor a staff workspace.

## Delivered workflows

- Leadership: current portfolio/catchment counts, physical bed occupancy, recorded reservation collections over the previous 30 days, office escalations, and a business-decision queue. Collections are reported receipts, not recognised company revenue or verified bank settlement. No fabricated history or comparison periods.
- Business decisions: expenditure, refund authorisation, policy change and senior appointment requests. A different authorised person must approve/reject, with a reason; row locks prevent conflicting/replayed decisions. Decisions never execute payments, assign roles or change settings.
- Front Desk: create inquiry, onboarding, appointment and refund-request cases; search/filter the queue; update notes/status and escalate. Appointments require a date/time. An optional full reservation reference returns only the relevant status, property and recorded-payment status in the same catchment. Supervisors can assign a case to eligible office staff through the API; the current UI creates a case assigned to its creator.
- Owners: offer individual/agency mandates for one property, choose capabilities and a validity period, inspect status and manager reports, and revoke with confirmation.
- Managers: enroll using a customer account, accept/reject mandates, switch between authorised properties, edit allowed property fields, inspect scoped rooms/reservations/statements, manage maintenance/incidents, publish occupant notices and submit owner reports.
- Agencies: register an organisation, add existing active customer accounts, remove members, and assign enrolled individuals a subset of the permissions held on the same mandate. Members use individual accounts. Removing membership revokes associated assignments; rejoining does not restore them.
- Occupant notices: notices appear on the student dashboard only for that student's booked/occupied property.
- Role editor: grouped catalogue, role-specific boundary descriptions, mobile role selection, permission search, granted-only filter, keyboard tabs, and explicit save/discard protection when switching roles.

## Property capabilities

All mandates require `property.read`. Both the mandate and the individual's assignment must cover an action.

| Capability | Delivered behaviour |
| --- | --- |
| `property.read` | Property details and room inventory |
| `property.edit` | Property description and contact fields |
| `reservations.read` | Scoped reservation status and occupant name for coordination |
| `maintenance.manage` | Create maintenance/incident records and update their workflow status |
| `notices.manage` | Publish immutable notices visible to current booked/occupied students |
| `finance.read` | Scoped recorded booking fees and deposits; no payout changes or payment execution |
| `reports.submit` | Submit immutable property reports visible to the owner |
| `team.manage` | Assign agency staff within the same mandate, without self-elevation |

Pricing changes, listing publication/verification, room structural changes, reservation state changes, custodial/worker invitation flows, ownership transfer and payout changes remain with their existing authorised workflows. No blanket landlord permissions are copied to managers. Business approval thresholds and automatic execution rules were not specified; no GM financial approval limit was invented.

## Enforcement and data lifecycle

### Landlord property teams

Landlords open **Property team** or the team action on a property to assign an active, email-verified customer account as a Custodian or Property Worker. Worker duties use the existing cleaner, security officer, maintenance worker and general worker categories. Each assignment writes a property-scoped role grant and a property membership in one audited transaction. Assignment starts immediately and continues until removed. Owners can remove an individual assignment without affecting that person's assignments at other properties.

Property Managers use the existing individual/agency mandate flow, with the selected property carried into the form, explicit capabilities, acceptance and expiry. Landlords cannot grant company General Manager, Director or other company staff roles. Company identities cannot receive ground-team grants through this workflow.

Custodians and workers enter the **Property team** workspace to see their assigned properties and property contact. They are not sent through owner registration or KYC. Accounts that also own properties retain their landlord dashboard and can see assignments to them on the team page. Role and membership revocation removes access on subsequent session/API lookups. This release adds the assignment and property-context screens; existing specialised role permissions remain governed by their existing API guards.

`app_management_access_for` checks the current property owner, active/verified landlord, active recipient, mandate acceptance/dates/revocation, individual capabilities, agency membership where applicable, and active Property Manager role with `management.use`. Checks run for each property request. New tables use forced RLS with service-only policies; API projections and mandate checks precede service access. Mutations are audited within their transaction. A shared transaction lock serializes management mutations and mandate/member revocation.

The new tables preserve the existing purge contract through cascade/set-null foreign keys. Purging a property removes its operational management data; retained actor references are anonymised on user purge. Ordinary revocation preserves history.

## Rollout

Apply forward migrations `0081` through `0084` in order, then build shared/API/web packages. Migrations create role definitions and default grants only; they do not assign real people to the new roles. Assign company roles through the existing authorised staff workflow; owners create property mandates in their portal. Deploy the release to staging through the existing main-branch CI workflow. Production deployment is a separate manual action and is not part of this release.

## Verification record

- Fresh isolated PostGIS database; migration journal and four new role definitions read back.
- Full API regression: 88 suites, 1,006 tests passed.
- Full web regression: 78 suites, 443 tests passed.
- Fourteen real-database feature tests cover recipient validation, owner authority, acceptance, cross-property isolation, capability denial, expiry, revocation, agency assignment/removal, independent approvals, office scoping, aggregate query execution and forced RLS on all six new tables.
- Local HTTP checks verify role-level endpoint denial, manager/agency workflows, prohibited property edits, senior-role invitation protection, MFA and stale-session denial.
- Rendered browser checks use isolated local test identities: role-editor save/discard guard; Front Desk create/escalate; GM request and independent Director approval; manager notice publishing; owner report receipt; individual mandate acceptance and owner revocation; restricted agency-member tabs; keyboard tab switching; phone and landscape layout inspection.

Final affected API regression: 9 suites / 116 tests passed; service and dedicated RLS regression: 2 suites / 14 tests passed. API and web production builds, workspace lint and final web type checking passed. Rendered checks covered normal desktop/phone/landscape layouts, light/dark role editing, and a temporary real 200% root-text override. That override was removed and the original global stylesheet restored exactly. Header wrapping, page-title wrapping and long action labels were corrected during the enlarged-text review. Local preview fixtures are disposable and do not represent production metrics or real staff assignments.

## Release integration and invitation acceptance

The release is based on current remote main, with the pre-existing migrations through `0080` preserved. The role migrations are `0081`–`0084`. Current mobile-search, password-reset, room-management and legal behaviour are retained. Local preview/test accounts, session helpers and temporary role databases were removed; none are seeded by deployment.

For real-email acceptance, a Super Admin opens Staff accounts, invites a Director or General Manager and chooses the intended scope (Directors are platform-wide). Each recipient accepts through the existing staff sign-in and provider MFA flow. A General Manager should land on Leadership and be able to submit a decision request; a different Director can decide it. Front Desk users should land on their case queue and cannot open the role editor. Landlords appoint property managers through their own Property managers page. Real invitation delivery and provider enrollment are intentionally left to the owner, who requested to perform those checks personally.
