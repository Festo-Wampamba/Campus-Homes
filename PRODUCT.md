# Product

## Register

product

## Users

Three role-gated audiences in Kampala, Uganda, starting with Makerere University:

- **Students** — hunting for verified hostels/rentals near campus, mostly on
  mid/low-end Android phones over patchy mobile data. Job: find a trustworthy
  room fast and contact the right landlord. Reservation holds are currently
  free; the hold duration comes from the platform policy (24 hours by default).
  High stakes, low patience, thumb-first usage.
- **Landlords** — property owners listing hostels. Often older, less
  tech-fluent; onboard once (KYC + ID upload), then check a reservation inbox.
  Job: get verified, get tenants, protect reputation.
- **Ops field agents** (inspectors + leads) — CampusHomes' own staff physically
  verifying properties with a 6-component checklist, frequently offline on
  site. Job: drain a verification queue accurately; their app is a first-class
  field tool, not back-office.

Plus a public pre-login discovery/marketing surface (search + listing detail).

## Product Purpose

CampusHomes is a verified student-housing marketplace. The current MVP loop is:
landlord lists → Ops physically verifies → listing goes live → student discovers
the verified property → student makes a free reservation hold → student views
the room and agrees tenancy terms with the landlord. Rent and leases happen
off-platform. Reservation hold duration is read from the persisted platform
setting (24 hours by default); the interface must never promise a fixed period
or fee without reading the current policy.
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
3. **Money moments are calm.** The current reservation hold is free. If a paid
   workflow is introduced later, it must stay deliberately quiet: one action
   per screen, an explicit current-policy statement, visible state (held /
   booked / expired), no urgency theatrics.
4. **Same vocabulary, three portals.** Student, Landlord, and Ops share one
   component language; portals differ by density and navigation, not by
   dialect. A button, form control, or status chip looks identical everywhere.
5. **Show the system's honesty.** Timers (configured reservation hold, SLA age), checklist
   progress, and sync state are shown truthfully from real data — the UI never
   fakes certainty it doesn't have (esp. offline queue state in Ops).

## Accessibility & Inclusion

- WCAG 2.1 AA floor: 4.5:1 body contrast, 3:1 large text, visible focus rings.
- Touch targets ≥ 44px; forms operable one-handed on small screens.
- `prefers-reduced-motion` honored on every animation.
- English-only at MVP but next-intl scaffolded day one; copy written in plain
  English for non-native speakers (no idioms in critical flows).
- Real-device testing on phones actually common in Kampala (brief §18).


## Public discovery and free reservation contract

The public/student redesign follows the approved DigsConnect compositions while preserving CampusHomes’ inspection-led operating model. Only Makerere is enabled in discovery; future universities are configured centrally when supply is ready.

Public search provides lowest/highest available semester price and approximate campus-distance sorting, 20-result pages with Load more, URL filters and explicit map-area search. The legacy search endpoint keeps its array response. Prices, category facts and internal available-bed counts use the same eligible inventory. Public UI shows availability status rather than numeric stock counts, while management inventory tools retain their counts.

Students select a room category, sign in if needed, complete the minimum profile if missing, review the category and charges, then explicitly confirm a free reservation. It holds an available bed within that category; it does not promise a photographed room number. Expiry comes from the server. Booking requests, landlord confirmation and cancellation protections remain unchanged. There is no new payment checkout.

Viewing requests require a landlord reply before an appointment is confirmed. Questions and viewing requests link to the student's inquiries in Support. Favourites remain account-backed; recently viewed properties remain browser-local. Public reviews are genuine resident ratings resolved across listing versions for the property, without resident contact details.

Unknown deposits and charges remain unstated. No complete move-in total, travel time, university partnership, sponsored placement or testimonial is invented. Empty inventory is distinct from request failure. Staging acceptance and production deployment are separate release steps.
