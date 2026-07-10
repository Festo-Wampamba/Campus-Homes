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
never a state color. Dark mode: deferred post-MVP; tokens are structured so a
`.dark` block can be added without renaming.

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
| `--coral-500` | `oklch(0.735 0.115 22)` | #f08080 | Secondary accent — marketing highlights, favorites (M2) |
| `--coral-600` | `oklch(0.65 0.13 22)` | — | Coral on light bg when text-adjacent |

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
  18 / 22 / 26 / 32. Marketing hero may reach 44–56px, never higher.
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
  (72-hour timer, tabular nums), `SyncStateIndicator` (ops offline queue:
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
