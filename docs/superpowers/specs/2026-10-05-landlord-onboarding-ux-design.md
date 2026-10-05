# Landlord onboarding UX — design

**Date:** 2026-10-05
**Branch:** `feat/landlord-onboarding-ux` (from `development` at `7ccec1d`)
**Status:** approved in conversation (sections 1–2); this document is the written spec for review.

## 1. Intent

Festo ran the landlord journey end to end on staging (sign-up → onboarding → KYC
approval → dashboard) and found that it works but feels wrong in specific ways:
landlords see options meant for students and staff, a pending landlord can reach
the full dashboard, the waiting experience is a dead end that needs a manual
reload, and several screens are cramped. The goal is a landlord journey that is
clear from the first click, gated until an admin approves, and that moves the
landlord forward on its own when the decision lands.

**Success means:**

- From the public landlords page, a landlord only ever sees landlord choices.
- A landlord whose KYC is not `verified` cannot see any dashboard surface, by any
  navigation path.
- Approval moves an open "under review" page into the dashboard within ~5 s,
  without a reload. Rejection tells the landlord exactly what to do next.
- No screen tells a landlord something untrue (e.g. "students can reserve" before
  an inspection has published a listing).

**Out of scope:** live push (Soketi is not provisioned), changes to the KYC review
process itself, new account-security capabilities, any production deploy (this
ships as its own PR after the pending security release).

## 2. Root cause of the dashboard leak (bug)

`apps/web/src/app/(landlord)/layout.tsx` already redirects non-verified landlords
to `/landlord/approval-pending`. But Next.js App Router layouts are not re-run on
client-side navigation between pages that share them. The onboarding wizard
finishes with `router.push("/landlord?submitted=property")`
(`onboarding-wizard.tsx:253`); onboarding and the dashboard share the `(landlord)`
layout, so the gate never executes and the pending landlord lands on the
dashboard. The API still rejects most landlord actions for unverified accounts
(`auth/roles.ts:91`), so this is a UI-boundary bug, not a data leak.

## 3. Design

### 3.1 Approval gate — split route groups (approach A)

- New route group `apps/web/src/app/(landlord-setup)/` with its own bare layout
  (CampusHomes frame, no `AppShell`, no sidebar). It owns:
  - `landlord/onboarding/` (moved from `(landlord)`)
  - `landlord/approval-pending/` (moved from `(landlord)`)
  URLs are unchanged; route groups add no path segment.
- `(landlord-setup)/layout.tsx`: `requireWorkspace("landlord")`, load the landlord
  profile, then:
  - on `/landlord/approval-pending` with no profile → redirect to onboarding;
  - verified → redirect to `/landlord`.
  (Onboarding's own page keeps its existing "already has a property → leave"
  check.)
- `(landlord)/layout.tsx` keeps its gate (no profile → onboarding; not verified →
  approval-pending), now with the onboarding/approval exemptions removed because
  those paths no longer render under it.
- Because navigating from `(landlord-setup)` into `(landlord)` mounts a different
  layout, the dashboard gate always runs on entry. The wizard's success action
  navigates to `/landlord/approval-pending` instead of `/landlord`.
- Accepted limitation: if an already-verified landlord is revoked mid-session, an
  open dashboard tab is not ejected until its next full load. The API boundary
  still blocks their actions.

### 3.2 Sign-in screen — landlord mode

`(auth)/sign-in/sign-in-form.tsx` derives a mode from the sanitised `next`:

| `next` | Primary action | Secondary link | Hidden |
|---|---|---|---|
| `/landlords/enroll` | **Create landlord account** → `signInUrl("consumer", "/landlords/enroll", "landlord")` (Logto's hosted page, which offers both create-account and sign-in; no first-screen hint is added — that would need an auth-controller change and is out of scope) | "Already have an account? Sign in" → landlord sign-in mode | student, staff |
| `/landlord` or `/landlord/...` | **Sign in to manage my properties** → `signInUrl("consumer", next, "landlord")` | "New landlord? Create an account" → create mode | student, staff |
| anything else | unchanged full chooser | — | — |

Landlord-mode intro: "Landlord account — list and manage your properties on
CampusHomes." Error messages and the Terms/Privacy line render in every mode.
The public landlords page links already send these two `next` values; no change
there beyond verifying the "Sign in to your dashboard" link uses `next=/landlord`.

### 3.3 Usernames without "@"

Display-only change (usernames are already stored without "@"):
- `components/shell/app-shell.tsx`: render `{user.username}`, not `@{user.username}`.
- `app/onboarding/onboarding-form.tsx`: remove the "@" input adornment.
Applies to every user type because both components are shared.

### 3.4 Onboarding form — roomier and resizable

In `onboarding-wizard.tsx` (now under `(landlord-setup)`):
- Wider container, larger vertical gaps between field groups, two-column grids
  collapse to one column below `md`.
- Free-text fields (address/landmark, alternative name) become `textarea`s with
  `resize-y` and a min/max height.
- The form card gets a bottom-right resize handle (`resize` + `overflow-auto`)
  bounded by `min-w`/`max-w-[min(100%,72rem)]` and `min-h`; disabled below `sm`
  where it stays full width.

### 3.5 "Under review" page

`(landlord-setup)/landlord/approval-pending/` becomes a full-screen teal page
(the existing `account-pending` visual family) with a client component:

- **Stamp animation:** an inline SVG rubber stamp (teal handle, coral ink pad)
  that hovers, presses onto an "APPROVED" pad with a small ink ring, lifts, and
  loops (~2.4 s), recreating the referenced Dribbble GIF in CampusHomes colours.
  CSS keyframes only; under `prefers-reduced-motion: reduce` the stamp is static.
- **Pending copy:** "We're reviewing your application" / "Our team is checking
  your details and documents. This page will open your dashboard automatically
  as soon as you're approved." plus a subtle "Checking for updates…" and Sign out.
- **Approved:** stamp lands on "Approved", copy "You're approved! Opening your
  dashboard…", then `router.replace("/landlord")` after ~1.2 s.
- **Rejected:** animation stops; copy "We couldn't verify your application. The
  documents or information provided weren't clear enough. Please email our team
  at support@campushomes.co.ug so we can help you complete your registration."
  The address is a `mailto:` link.
- Status changes are announced via an `aria-live="polite"` region.

### 3.6 Polling

`useLandlordApprovalStatus` (client hook, same folder):
- `GET /landlords/me` every 5 s and immediately on `visibilitychange` to visible
  / window `focus`; paused while the tab is hidden.
- Stops on a final status (`verified` or `rejected`).
- Network/5xx errors: keep last known state, show "Having trouble checking —
  we'll keep trying", back off to 15 s after 3 consecutive failures.
- 401 → `window.location.assign("/sign-in?next=/landlord/approval-pending")`.
- Initial state comes from the server render, so the page is correct before the
  first poll.

### 3.7 Dashboard banner

`components/kyc-banner.tsx` gains a `hasLiveListing` input:
- `verified` + no live listing: "Your account is verified. Our Ops team will
  contact you to schedule an inspection of your property — your listings go live
  once it passes."
- `verified` + live listing: "Your account is verified and your listings are
  live. Students can now reserve your rooms."
- `pending` / `rejected` wording stays (those states are now only reachable on the
  under-review page, but the profile page still renders the banner).

**API addition (the only one):** `ListingsService.myProperties` adds a second
statement in the same `rlsDb.run`: select `property_id` from `listings` where
`status = 'verified'` (RLS-scoped to the landlord), and returns each property with
`hasLiveListing: boolean`. Two statements, one policied table each — never a
join or correlated subquery across RLS-heavy tables (2026-09-23 rule). The shared
`propertySchema` gains `hasLiveListing: z.boolean().optional()` so existing
parsers keep working. The dashboard computes `properties.some(p => p.hasLiveListing)`.

### 3.8 Edit-property dialog

`(landlord)/landlord/properties/property-form-dialog.tsx`:
- Default width ~`60rem`, bottom-right resize handle bounded by
  `min-w-[36rem]`, `max-w-[95vw]`, `min-h-[24rem]`, `max-h-[90vh]`.
- Body scrolls; header and the Cancel / Save footer stay pinned.
- Below `sm` the dialog is full-width with no resize handle.

### 3.9 Account Settings

`(landlord)/landlord/profile/` reorganised into four sections with a sticky
in-page side menu (anchor links) on `lg`+, stacked with headings below:

1. **Personal details** — name, date of birth, gender, nationality, address.
2. **Identity & verification** — KYC banner, legal name, ID document.
3. **Contact & emergency** — phone, emergency contact.
4. **Sign-in & security** — change sign-in email (code-verified) and password,
   reusing the admin `security-settings.tsx` logic, moved to a shared component
   (`components/account/security-settings.tsx`) used by both admin and landlord.
   Uses existing `/me/email/code`, `/me/email`, `/me/password` (no role gate).

Fields and save behaviour are unchanged; only grouping, headings and navigation.

## 4. Error handling summary

| Situation | Behaviour |
|---|---|
| Poll network/5xx | keep last state, gentle notice, 5 s → 15 s backoff after 3 failures |
| Poll 401 | send to sign-in, returning to the review page |
| Tab hidden | polling paused |
| Pending landlord deep-links any `/landlord/*` | dashboard layout redirects to review page |
| Verified landlord opens review page | setup layout redirects to `/landlord` |
| `myProperties` second query fails | whole request fails as today (same transaction) |

## 5. Testing

Web (Jest, behaviour-first, one assertion each):
- Sign-in: `next=/landlords/enroll` → only "Create landlord account";
  `next=/landlord` → only "Sign in to manage my properties"; no `next` → full
  chooser incl. staff.
- Review page: pending renders review copy; poll returning `verified` calls
  `router.replace("/landlord")`; `rejected` renders the support mailto;
  reduced-motion → stamp has no animation class.
- Polling hook: pauses when hidden; stops after a final status; 401 redirects.
- Banner: verified + no live listing → inspection copy; verified + live listing →
  live copy.
- Account menu: username renders without "@".
- Wizard success navigates to `/landlord/approval-pending`.

API (Jest + docker test DB):
- `myProperties` returns `hasLiveListing` true only for the landlord's property
  with a `verified` listing; false otherwise; never another landlord's listing.

Manual (local stack, browser): landlord sign-up from `/landlords` shows only
landlord options; onboarding has no sidebar; submit lands on the review page;
admin approves in another tab; the review page enters the dashboard on its own;
rejection shows the support email; edit dialog and onboarding card resize within
bounds; Account Settings sections and side menu work at desktop and mobile widths.

Gate: `pnpm lint && pnpm typecheck && pnpm test` green; `drizzle-kit check`
unchanged (no migrations).
