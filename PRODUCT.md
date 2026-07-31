# Product

## Register

product

## Users

Three role-gated audiences in Kampala, Uganda, starting with Makerere University:

- **Students** — hunting for verified hostels/rentals near campus, mostly on
  mid/low-end Android phones over patchy mobile data. Job: find a trustworthy
  room fast and contact the right landlord. Paid reservation holds arrive in
  Phase 2. High stakes, low patience, thumb-first usage.
- **Landlords** — property owners listing hostels. Often older, less
  tech-fluent; onboard once (KYC + ID upload), then check a reservation inbox.
  Job: get verified, get tenants, protect reputation.
- **Ops field agents** (inspectors + leads) — CampusHomes' own staff physically
  verifying properties with a 6-component checklist, frequently offline on
  site. Job: drain a verification queue accurately; their app is a first-class
  field tool, not back-office.

Plus a public pre-login discovery/marketing surface (search + listing detail).

## Product Purpose

CampusHomes is a verified student-housing marketplace. The Phase 1 MVP loop is:
landlord lists → Ops physically verifies → listing goes live → student discovers
the verified property and contacts the landlord. Rent and leases happen
off-platform. Phase 2 activates the already-designed 5,000 UGX, 72-hour
reservation-hold and payment flow, followed by move-in confirmation and reviews.
Verification is the product; everything else serves it.

## Brand Personality

Trustworthy, warm, grounded. Tagline: "Live, Learn, Succeed." The interface
should feel like a competent local institution — closer to a good bank app
than a startup landing page. Confidence comes from clarity and the
verification system, not from decoration. Warmth comes from the coral accent
and photography, not from playfulness in the UI chrome.

## Anti-references

- Generic AI-generated SaaS: gradient heroes, glassmorphism, identical card
  grids, eyebrow-label scaffolding. This must read as a designed product, not
  a template.
- Airbnb cosplay — search/map layout patterns are fine (users know them), but
  not its visual identity.
- WordPress-directory look (the original WP Residence starting point):
  cluttered widget sidebars, badge soup, five competing CTAs.
- Back-office drabness in the Ops portal — it is a first-class field tool and
  gets the same craft as the student surface.

## Design Principles

1. **The badge is the brand.** The verification state (verified / pending /
   expired / suspended) is the single most load-bearing UI element. It gets a
   consistent, unmistakable treatment everywhere it appears; nothing else may
   imitate it.
2. **Built for the Kampala pocket.** Mid-range Android, intermittent data,
   sunlight-readable. Fast first paint, generous touch targets, offline states
   designed — never an afterthought spinner.
3. **Money moments are calm.** When payments activate in Phase 2, the
   reservation-hold flow (the only payment on the platform) is deliberately
   quiet: one action per screen, explicit amounts, visible state (held / paid /
   expired), no urgency theatrics.
4. **Same vocabulary, three portals.** Student, Landlord, and Ops share one
   component language; portals differ by density and navigation, not by
   dialect. A button, form control, or status chip looks identical everywhere.
5. **Show the system's honesty.** Timers (72-hour hold, SLA age), checklist
   progress, and sync state are shown truthfully from real data — the UI never
   fakes certainty it doesn't have (esp. offline queue state in Ops).

## Accessibility & Inclusion

- WCAG 2.1 AA floor: 4.5:1 body contrast, 3:1 large text, visible focus rings.
- Touch targets ≥ 44px; forms operable one-handed on small screens.
- `prefers-reduced-motion` honored on every animation.
- English-only at MVP but next-intl scaffolded day one; copy written in plain
  English for non-native speakers (no idioms in critical flows).
- Real-device testing on phones actually common in Kampala (brief §18).
