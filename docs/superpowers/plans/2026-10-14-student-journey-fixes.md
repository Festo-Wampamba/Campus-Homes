# CampusHomes student-journey fixes: phased plan (2026-10-14)

## Context

A live inspection of campushomes.co.ug, a second inspection report, and Festo's handwritten backlog (R01–R19) found problems along the student path from finding a room to reserving it. Festo wants them fixed in small phases, each its own PR to `development`. The work starts with the mobile menu and the search layout. Every item also goes into `TODOS.md` so nothing gets lost.

Decisions already taken:
- **Accent colour:** peach `#fcb177`, already in PR #160.
- **Price floor:** UGX 50,000.
- **R03 (phone):** covers two things. The site layout on phones (Phase 1) and the phone-number box (reproduce in Phase 3; the PhoneField fix from #152 may already cover it).
- **R07 (message area):** means the chat composer.
- **R05 (payments):** stays Phase 2 by the locked product decision (`CLAUDE.md`). Nothing to build now.
- **R08 (location):** deferred ("NOT NOW").

Each phase: branch from `origin/development`, then lint, typecheck and the relevant tests. Check visible changes in the browser preview at 375px and desktop. Then open a PR to `development`, merge after CI, and promote `development` to `main` (which deploys staging).

---

## Phase 0: TODOS.md backlog (docs, done first)

Add items 9+ to the `TODOS.md` status board, in the existing format: the `| # | Item | Owner | Status |` table plus one `## N.` section per item. Each item maps to the phase that fixes it:
- Inspection findings:
  - UGX 2 price (data, Festo)
  - Cloudflare email obfuscation (Festo, dashboard)
  - conflicting furnishing amenities (data, Ops)
  - "Makerere Hill," title and trailing comma
  - map worker console noise
  - slow listing navigation
  - cookie banner size on phones
- Backlog: R01–R19 with their phase, or Deferred (R05 payments, R08 location, R19 chatbot after Phase 6).
- Merge PR #160 (peach accent) alongside.

## Phase 1: mobile menu + search layout (requested now)

**Mobile menu.** In `apps/web/src/components/shell/site-header.tsx`, a server component with four hard-coded `<Link>`s hidden below `md`/`sm`:
- Move the four links into one `NAV_LINKS` array.
- Add a small client component, `components/shell/mobile-nav.tsx`. It renders a hamburger (`md:hidden`, lucide `Menu`) that opens a drop-down panel under the sticky header listing the four links.
- Copy the existing patterns:
  - Open/close state and overlay from `components/shell/app-shell.tsx:187,294-305`.
  - Escape and click-outside handling plus `aria-expanded` from `components/shell/account-menu.tsx:17-56`.
- Close the panel on link click and on route change. Keep the landlord-access label ("Landlord" vs "For landlords") and pass it in as a prop.

**Search filter layout.** In `apps/web/src/app/(public)/search/search-client.tsx:218-296`:
- The hostel-name search gets a full-width row of its own.
- Min/Max price and the three selects go on a second row as a responsive grid: 2 columns on mobile, 5 on wide screens. "Any bathroom" no longer sits alone.
- Placeholder "Search by hostel name or area" stays readable.

**Card names.** Use `line-clamp-2` instead of `truncate` on the card title (`search-client.tsx:399`) and on the homepage `components/featured-card.tsx:47`, so long hostel names wrap instead of getting cut.

Tests: a `mobile-nav` test (opens, lists 4 links, Escape closes) using the repo's `react-dom/client` + `act` pattern.

## Phase 2: search correctness (R01, R14, R15, room count)

- **Clear filters (R15):** a "Clear filters" button inside the filter area. It resets all five filter states, keeps the search text, and only shows when a filter is set.
- **Empty state:** when filters are active and nothing matches, show "No hostels match your filters" with a Clear-filters action (`EmptyState` `action` prop). The current "No verified places in this area yet" stays only for the no-filter case (`search-client.tsx:323-329`).
- **Errors (R01):** confirm a failed request shows the existing error state with retry, never a false "0 found".
- **Room vs bed count:** `listings.service.ts` `search()` counts available **beds** as `unit_count`, so cards read "108 rooms" for 38 rooms. Add a `room_count` (`COUNT(DISTINCT un.id)`) column next to it, also in the saved-listings query around :922. Add it to `listingSearchResultSchema` (`packages/shared/src/listing.ts:125`). `roomSizeLabel()` (`apps/web/src/lib/format.ts:133`) then renders "38 rooms · 108 beds free".
- **Bathroom filter wording (R14):** relabel the options "Self-contained" / "Not self-contained" (`search-client.tsx:293-295`). Data mapping is unchanged: `units.self_contained` boolean.
- **Addresses:** trim stray trailing commas and spaces in addresses in one shared display helper in `lib/format.ts`. Use it for cards and the detail page.

Tests: API spec for `room_count`; web tests for clear filters and the filtered empty state.

## Phase 3: reservation journey (R02, R04, R10, R13, R17 + Festo's popup/"reserved for" request)

- **Return to the listing after sign-in (R02):** "Sign in to reserve" and "Sign in to ask a question" on `apps/web/src/app/(public)/listings/[id]/page.tsx:218,306-314` link to plain `/sign-in`. Add `?next=/listings/<id>`. The redirect plumbing (`safeAuthDestination` → callback) already works.
  - Sessions already last 7 days, so this is the main "signing in again" fix.
  - `prompt=login` on consumer sign-in stays; it's deliberate, to avoid reusing another account.
- **Confirmation popup with 24h hold (R17):** `components/reserve-button.tsx` currently just calls `router.push("/reservations")` and ignores the response. After a successful `POST /reservations/reserve`, open the existing `Dialog` (`components/ui/dialog.tsx`) showing:
  - "Room reserved for you"
  - hostel name, room type, bed label
  - "Held for 24 hours, until <reservedExpiresAt formatted>"
  - the next steps
  - a "View my reservations" button that goes to `/reservations?new=<id>`.

  The hold time comes from the API response, not hard-coded, so an admin-changed hold still shows correctly.
- **My reservations (R04, R10):** in `app/(student)/reservations/reservations-list.tsx`:
  - Sort live statuses (reserved, booked, occupied) before the history.
  - Highlight the `?new=` reservation with a "Just reserved" ring.
  - Add a live countdown that ticks each minute.
  - Show a short reference (first 8 characters of the id) and the reserved date. This needs `createdAt` added to `mine()` (`reservations.service.ts:515`) and `studentReservationViewSchema` (`packages/shared/src/reservation.ts:80`).
  - Ask for confirmation before Cancel, and show cancel errors instead of swallowing them.
- **Reservation limit (R13):** 3 active per student, already enforced server-side (`MAX_ACTIVE_RESERVATIONS`). Show "You can hold up to 3 rooms at once" near the reserve buttons. Fix the stale "One active reservation per student" comment.
- **Phone-number box (R03b):** reproduce onboarding and profile phone saving on staging. Fix only if it still fails.

Tests: the reserve-button test shows the dialog with the expiry from the response; the reservations-list test checks sort order and highlight; API spec for `createdAt` in `mine()`.

## Phase 4: information before reserving (R06, R09, R11, R12)

- **House rules (R12):** `properties.house_rules` exists (admin-edited, `admin-properties.service.ts`) but is never public. Add it to the listing detail query, `listingDetailResponseSchema` and a "House rules" section on the detail page. Zod strips undeclared keys, so the schema must be extended.
- **Amenities and gender policy near Reserve (R06, R09):** show a compact summary of confirmed amenities and the gender arrangement in the reserve panel or confirmation dialog. Missing data reads "Not provided".
- **Viewings (R11):** surface the existing "Request a viewing" (`ask-landlord-dialog.tsx` viewing checkbox) as its own button on the listing.
  - A structured visiting-hours field needs a migration plus admin and landlord forms. Record it in TODOS as a follow-up; don't build it here.

## Phase 5: data-quality guards

- **Price floor:** add `MIN_PRICE_PER_TERM_UGX = 50_000` to shared and use it in the Ops publish schema (`packages/shared/src/ops.ts:166`), room management (`room-management.ts:34`) and admin (`admin.ts:135`), with a clear message. No DB CHECK change; keep it app-level so existing rows don't break a migration.
- **Furnishing exclusivity:** `fully_furnished` / `partly_furnished` / `unfurnished` (`apps/web/src/lib/format.ts:62`) become radio-style in the Ops publish confirmation and the landlord forms. Shared validation rejects more than one.
- **Production data fixes (with Festo's approval, through the Ops/admin UI, not raw SQL):**
  - Kasubi Horizon single-room price
  - its furnishing amenities
  - the "Makerere Hill" listing title

## Phase 6: help and support (R07, R16, R18)

- **Chat composer (R07):** auto-grow the composer (`chat-inbox.tsx:83`) with CSS `field-sizing: content` plus the existing `max-h-36`.
- **FAQ (R16):** expand the homepage `FAQS` (`(public)/page.tsx:80`) with 24h hold and expiry, the 3-room limit, payments (offline, agreed with the landlord), viewings, cancellations and support. Answers must match the real behaviour above.
- **Support form (R18):** add an optional reservation picker or reference to `SupportDesk`. This means an optional `reservationId` on `createInquirySchema` (`packages/shared/src/inquiries.ts:18`), and the API checks it belongs to the student.

## Deferred / owner actions

- **R05** payments: product Phase 2.
- **R08** location.
- **R19** chatbot: after Phase 6 FAQ and support.
- **Festo:**
  - Cloudflare → turn off Email Address Obfuscation
  - the Kasubi single-room price
  - the staff sign-in check (Step 1)

## Verification (each phase)

- `pnpm --filter @campushomes/web lint && typecheck && test`. Add the `api` suite whenever API or shared code changes, using the docker test DB at :54329 and `TEST_DATABASE_URL`.
- Browser preview at 375×812 and desktop for visible changes:
  - Phase 1: the menu opens and closes and the filters don't overflow.
  - Phase 3: the full reserve → dialog → `/reservations?new=` flow against the local API with a test student.
- After merging to `main`: confirm staging `/api/v1/health` shows the new commit and spot-check the change on staging.
