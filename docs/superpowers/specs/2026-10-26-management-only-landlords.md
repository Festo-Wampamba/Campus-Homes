# Management-only landlords: plan for review

Status: reviewed by Festo 2026-10-26 (decisions below). Question 4 still open.
Nothing here is built yet.

## The problem

Some landlords already have full hostels. They want CampusHomes to run the
property (rooms, tenants, payments, receipts, messages, reports), not to be
listed to students. Today every landlord goes through the same path, and that
path assumes listing:

1. Every submitted property goes into the Ops verification queue
   (`OpsService.queue()` has no filter for intent), so Ops would schedule site
   visits for hostels that will never be published.
2. Room changes from Manage Rooms wait for Ops review (`pending_review`), and
   some wait for a site visit (`visit_required`). That review protects what
   students see. For a property that students never see, it only slows the
   landlord down.
3. The sign-up copy and the six steps describe verification as a required step.

What already fits: account approval (`approveAccount`, which sets
`kyc_status = 'verified'` and the property to `active`) is separate from listing
(visit, then publish). A landlord can already use the dashboard after account
approval with no live listing.

## Proposal

### 1. Intent is per property, not per landlord

New column `properties.listing_intent`: `'manage_only' | 'list'`, default
`'list'` so every existing property keeps today's behaviour.

Per property because one landlord can run a full hostel privately and list a
second one with vacancies.

### 2. The landlord chooses at onboarding

The first question of the property step: "What do you want to do with this
property?"

- **Manage it on CampusHomes** (rooms, tenants, payments, receipts). Not shown
  to students.
- **Manage it and list it to students** (adds an inspection visit before
  rooms go live).

The five declarations stay. For manage-only, the "authorises CampusHomes to
publish" declaration is hidden and stored as `false`.

### 3. Account approval stays for both

Identity review (legal name, ID) stays required for manage-only landlords. The
dashboard holds students' names, phone numbers and payment records, so we
still need to know who the landlord is. Only the property visit is skipped.

### 4. What changes for a manage-only property

| Area | `list` (today) | `manage_only` |
| --- | --- | --- |
| Ops verification queue | Appears | Does not appear |
| Room changes | Ops review, some need a visit | Ops review, never a site visit |
| Public search and listing page | After publish | Never |
| Student registration form / QR, walk-ins, payments, receipts, messages, reports | Yes | Yes |
| Booking requests from the public site | Yes | None (not listed) |

The rule "never shown to students" is enforced in the API (search and detail
already require a verified listing; Ops publish will refuse a manage-only
property), not only hidden in the web app.

### 5. Switching later

- **Manage-only → list:** a "List this property" button on the property page.
  It sets intent to `list`, the property enters the Ops queue, and the normal
  visit → publish flow runs. Rooms and prices entered while managing pre-fill
  the Ops publish form, so nothing is typed twice.
- **List → manage-only:** the landlord can switch only while the property has
  no live listing. Taking a live listing down is Ops-only (decision 2): the
  landlord asks, Ops unpublishes and switches the property.

### 6. Marketing page

The landlords page gets two paths above the six steps: "Manage only" and
"Manage and list". Choosing "Manage only" greys out step 5 (the verification
visit) and changes step 6 to "Start managing". One timeline, no second page.

## Build outline (after approval)

1. Migration: `listing_intent` column with CHECK, default `'list'`. RLS: the
   landlord may set it on insert and may change it only through the API path
   in step 4. RLS tests for both.
2. Shared: enum + schema field on property submit/update.
3. API: filter `queue()` by `listing_intent = 'list'`; room change sets on
   manage-only properties always go to `pending_review`, never
   `visit_required`; publish refuses manage-only; "request listing" endpoint.
4. Web: onboarding question, property page switch, Manage Rooms copy (no
   "waiting for review" on manage-only), landlords page path toggle.
5. Tests: service specs for the queue filter, auto-apply, publish refusal and
   the switch; web tests for the onboarding branch.

Rough size: 1 migration, ~6 API files, ~6 web files.

## Decisions (Festo, 2026-10-26)

1. **Pricing:** listing (manage and publish) becomes paid later. Copy should
   not promise "free forever" for listing. Management-only pricing not stated.
2. **Taking a live listing down:** Ops only. Landlords cannot unpublish.
3. **Room changes on manage-only properties:** still reviewed by Ops for
   security, but never require a site visit.
4. **Admin view:** open, see below.

## Open question 4, restated

Each property will carry a label: "Manage only" or "Manage and list". The
question is what staff can do with that label in the admin and Ops consoles:

- **See it:** show the label on each property in the admin Properties page
  and let staff filter by it (for example "show me all manage-only hostels").
- **Change it:** let Ops/admin switch a property between the two, for
  example when a landlord phones support asking to be listed, or when Ops
  takes a live listing down (decision 2) and the property becomes manage-only.

Recommendation: yes to both, with the change recorded in the audit log.
Decision 2 already needs Ops to be able to switch a live listing to
manage-only, so the switch has to exist for staff anyway.
