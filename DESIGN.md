# Design

Visual system for CampusHomes (`apps/web`). Source of truth for tokens is
`apps/web/src/app/globals.css` (Tailwind v4 `@theme` — CSS-first, no
`tailwind.config.js`). Brand inherited from
`OwnResourceFolder/CampanySurvey-Info/CampusHomes_Website_Design_Scheme.docx`
and the portal mockups in `OwnResourceFolder/CampusHomes Platform Design/`
(teal / white / light coral, Poppins + Open Sans) — refined, not replaced.

## Theme

Light, product register, Restrained color strategy: teal-tinted neutrals with
the brand teal carrying primary actions, selection, and the verification
system. Coral is a warm secondary accent (marketing surface, highlights) —
never a state color. Light and dark themes are supported. Public and student
route shells use scoped surface, text and border tokens; management workspaces
retain their existing layout and global typography.

## Color

All tokens OKLCH. Semantic (shadcn-compatible) names mapped from a small brand
ramp — components consume semantic names only.

### Brand ramp

| Token | Value | Hex origin | Use |
|---|---|---|---|
| `--teal-900` | `oklch(0.32 0.055 195)` | — | Headings on light, footer bg |
| `--teal-700` | `oklch(0.45 0.075 195)` | #0c5f5f | Hover/active primary |
| `--teal-600` | `oklch(0.54 0.09 195)` | #008080 | **Primary.** Buttons, links, selection, focus ring, verified badge |
| `--teal-100` | `oklch(0.95 0.02 195)` | #dceeee | Selected-row bg, badge tint |
| `--teal-50` | `oklch(0.977 0.01 195)` | #f4f7f7 | Sidebar / panel second neutral |
| `--coral-500` | `oklch(0.82 0.115 58)` | #fcb177 (peach orange) | Secondary accent — marketing highlights, favorites (M2) |
| `--coral-600` | `oklch(0.55 0.13 45)` | #ae5528 | Coral on light bg when text-adjacent |

### Neutrals (teal-tinted slate, chroma ≤ 0.01 toward hue 195)

`--bg` white `oklch(1 0 0)` · `--surface` `oklch(0.985 0.004 195)` ·
`--border` `oklch(0.91 0.008 195)` · `--muted-ink` `oklch(0.49 0.02 240)`
(slate-600, secondary text — passes 4.5:1 on bg/surface) · `--ink`
`oklch(0.31 0.03 245)` (slate-800, body/headings).

### Status vocabulary (the badge system — brief §1 core loop)

| State | Color | Token |
|---|---|---|
| verified / success / paid | green `oklch(0.55 0.15 150)` (#15803d) | `--success` |
| pending / awaiting / hold-active | amber `oklch(0.55 0.12 65)` (#B45309) | `--warning` |
| rejected / expired / suspended / destructive | red `oklch(0.55 0.2 27)` (#DC2626) | `--destructive` |
| draft / neutral / synced-offline | slate `--muted-ink` | `--muted` |

Each status = tinted bg (L ≈ 0.96) + solid ink + icon. Never icon-only, never
color-only. The **VerifiedBadge** (shield-check + "Verified") is reserved:
teal solid fill, white ink — no other chip may use solid teal fill.

## Typography

- **Headings / display:** Poppins 600 (700 only for the marketing hero).
  Letter-spacing -0.01em at ≥24px.
- **Body / UI / data:** Open Sans 400/600. Geometric + humanist pairing —
  brand-mandated, contrast axis is legitimate.
- Loaded via `next/font/google`, `display: swap`, subsets latin.
- **Fixed rem scale, ratio ≈1.2:** 12 / 13.5 / 15 (UI base) / 16 (prose) /
  18 / 22 / 26 / 32. The approved public homepage hero is centered at 62px on
  desktop and 38px on phones; other marketing headings stay within the scale.
- Numbers in timers, prices, SLA ages: `font-variant-numeric: tabular-nums`.
- Prose max 70ch; tables and dense ops UI may run full-width.

## Components

shadcn/ui primitives themed by the tokens above. Rules:

- Radius: `--radius: 0.5rem`; inputs/buttons `rounded-md`, cards `rounded-lg`,
  chips `rounded-full`. One shadow scale: `shadow-xs` resting, `shadow-md`
  hover-lift on interactive cards only.
- Every interactive component ships default / hover / focus-visible / active /
  disabled / loading. Focus = 2px teal ring, 2px offset, always visible.
- Buttons: primary = solid teal; secondary = white + border; destructive =
  solid red; ghost for toolbars. 44px min touch height on mobile.
- Loading = skeletons in-place, not centered spinners. Empty states teach
  (icon + one sentence + primary action).
- Signature components: `VerifiedBadge`, `StatusChip`, `HoldCountdown`
  (configured reservation timer, 24 hours by default, tabular nums), `SyncStateIndicator` (ops offline queue:
  queued / syncing / synced / failed — truthful, per PRODUCT.md principle 5).

## Layout

- Mobile-first. Student/public: single column, bottom-sheet patterns, sticky
  primary CTA. Landlord: simple stacked dashboard. Ops: densest — top bar +
  collapsible side nav on desktop, tab bar in the field.
- Spacing on the 4px grid; section rhythm varies (16/24/40) — no uniform
  24px-everywhere wallpaper.
- Z-index scale: dropdown 10 · sticky 20 · overlay 30 · modal 40 · toast 50 ·
  tooltip 60.

## Motion

- 150–250ms, `ease-out` (quart). State feedback only — no page-load
  choreography, no decorative motion.
- `HoldCountdown` ticks without animation; sync indicator may pulse subtly
  while syncing (opacity, not scale).
- Every animation has a `prefers-reduced-motion: reduce` fallback (instant or
  crossfade).

## Public and student redesign (22 October 2026)

The approved DigsConnect reference supplies the composition: centered photo-backed search hero, generous section spacing, photography-led cards, desktop results/map split, full-screen compact-screen filters, grouped property galleries, and persistent reservation actions. CampusHomes retains its logo, teal/peach palette, Poppins/Open Sans and Uganda-specific copy.

- Public content uses a roughly 1,280px container and consistent gutters. Desktop search fills the viewport with a roughly 30% results rail and a wider map; compact screens keep the list/map switch.
- Homepage order is hero, factual trust strip, enabled campus discovery, available inventory, areas, process, real reviews when present, final search invitation, local guidance and footer.
- Only configured Makerere discovery is enabled. Area counts come from the paginated search total, never a sampled card count.
- `HostelCard` supplies vertical and horizontal compositions. Category, bathroom, occupancy, inspection date and per-bed semester price remain explicit. Public cards and room choices show available/unavailable status without numeric bed, unit or room stock counts; those counts remain management information. Unavailable favourites do not advertise an available minimum price.
- Applied filters, sort and searched bounds live in the URL. Draft filter edits and gallery groups are local. Results restore loaded pages and scroll after a property visit.
- Property room choices distinguish capacity, category, bathroom, price and deposit; unavailable alternatives remain visible. Reservation confirmation is always explicit. Authentication restores context without sending a request.
- Public room facts pair Lucide icons with labels. View details opens a focused room dialog with photos, semester rent, deposit, occupancy, bathroom and published room amenities. Property amenities show six initially with an accessible Show all / Show fewer control; supplied house rules use the same icon treatment.
- Hostel sharing offers WhatsApp, copy link and email. Landlord join dates use the real landlord profile timestamp. Response percentages aggregate recorded listing inquiries aged 1–90 days, with a minimum of five observations; sparse history stays explicitly unknown and never becomes a guaranteed response time or a fabricated landlord trust badge.
- The sign-in/registration entry places its high-contrast local clock and date in normal flow above the form, avoiding fixed text behind the controls. Hosted identity-provider screens retain their existing behavior.
- Property pages group single and shared room types using CampusHomes labels (for example, Single and Single self-contained). The full description expands in place; the location mini map is visible initially. Campus distances use configured coordinates and are labelled approximate straight-line distances.
- The distance estimator compares published hostel coordinates with a configured campus or another published hostel. Its search is explicit, selections survive result-page changes, and the comparison map is opt-in. It does not invent road distances or travel times, and it does not change a student's profile.
- Inquiry safety tips sit with property rules and link to the safety page and contextual report flow. Listing reports go to Ops with a listing reference; they do not use the landlord-inquiry routing field.
- The header follows the current client route: transparent with white text over the homepage, landlord, contact, how-it-works and support heroes, becoming solid on scroll; opaque immediately on search, hostel and other supporting pages. Marketing text on photography and onboarding steps use explicit foreground/background pairs in both themes.
- Public styles live in `(public)/public.css`, student styles in `(student)/student.css`. Agreement presentation reuses the public shell without changing signing or acceptance rules.
- Contact Us is a dedicated `/contact` destination in desktop/mobile navigation and the footer. It uses the owner-supplied shared Akolet office contacts under CampusHomes branding; Support retains AI and manual help. Legacy contact/report URLs redirect with their context. A locally served WhatsApp shortcut supports mouse/touch dragging, arrow-key movement and Home to reset, retaining its position for the session and clearing cookie notices and phone reservation actions; staff workspaces retain their existing contact controls. Theme toggles use a plain transparent icon with a visible keyboard focus outline.
- Support uses a compact photographic hero, aligned resource sidebar and full-width AI/manual workspace. Small screens put the tools first. Manual prose and chat bubbles use a readable 15px scale, editable fields use 16px, controls have 44px targets, and chat surfaces follow the scoped public theme. The assistant has no live-availability indicator; specific account questions link to Contact Us.
- Important public/student controls have 44px activation areas. Compact-screen inputs use 16px text, native dialogs retain keyboard focus, and reduced-motion preferences suppress transitions and animation.
- Contact Us uses CampusHomes student-lounge photography with a dark teal scrim. The dedicated `/how-it-works` page is an editorial product showcase with eight user-controlled stages, labelled illustrative phone/desktop screens, brief state transitions, and horizontal step selection on compact screens. Motion serves the selected stage and respects reduced motion; the guide does not autoplay or simulate real account mutations. Its large display heading is a user-requested marketing exception to the ordinary heading scale.

See `docs/research/2026-10-21-digsconnect/IMPLEMENTATION.md` for evidence and release boundaries.
