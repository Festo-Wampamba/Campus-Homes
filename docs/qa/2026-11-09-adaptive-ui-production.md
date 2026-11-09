# Adaptive UI acceptance — 9 November 2026

## Outcome and scope

The shared public and workspace layouts now adapt to available content width, including sidebar space, browser text enlargement and resized dialogs. The CampusHomes brand and existing authentication, bookings, payments and inventory contracts are preserved.

- Public base text no longer grows automatically with monitor width. Composition has bounded maximum widths instead.
- Header navigation switches to its menu using a container query; menu dismissal follows the actual expanded navigation state. Existing viewport media rules remain as a fallback.
- Public footer columns reflow and long contact links wrap rather than forcing horizontal page overflow.
- Shared cards, workspace headings, action groups and table toolbars can shrink and wrap. Summary grids and room/tenant forms use content-based columns.
- The How it works hero has readable heading/caption line spacing. Callouts use paired theme surface/ink tokens and become normal rows on small screens.
- Dashboard status/trend colors, avatars and the student next-step card have explicit readable dark-mode pairs.

PR #308 (editable tenant emergency contacts) was merged separately as `3df0d1a0fc902d9a0d14a2f197360881a1a7aa21` before this branch was created.

## Browser evidence

Command: `pnpm --filter @campushomes/web exec playwright test --config playwright.adaptive.config.ts --reporter=list`.

The matrix contains three scenarios per engine, nine cases total, for Chromium, Firefox and WebKit. Public and student cases passed in the full run. The room-resize check initially read a transitional layout; it now waits for the requested dialog width and counts only non-collapsed CSS grid tracks. A focused rerun of all three management cases passed (3/3). All nine scenarios therefore have passing results on the final application changes.

- Viewports: 375×812, 844×390 landscape, 1024×768, 1280×720, 1366×768, 1536×864, 1920×1080 and 2560×1440.
- How it works: light/dark mode, no page-wide overflow, callout text contrast at least 4.5:1, caption line-height at least 1.15 times its font size.
- Public route families at compact laptop width: home, search, landlords, contact, safety, support, sign-in, staff sign-in, create-account, privacy and terms.
- Real admin, leadership and front-desk pages render with disposable local API fixtures, long names and large totals. Metrics remain visible without truncation.
- Landlord tenant dialog: phone, short landscape and laptop with 200% root text; Close remains reachable. Room-type dialog: 590px resize, fields reflow and Add Photos stays reachable.
- Student dashboard, saved rooms, reservations, profile and support at phone width. Public navigation and footer also checked at 200% text, including 853px and 1366px widths; menu opens and Escape closes it.

Fixtures are loopback-only and do not create hosted accounts, upload real photos or mutate bookings. The test setup is in `apps/web/e2e/adaptive-layout.spec.ts`, `adaptive-fixtures.mjs` and `playwright.adaptive.config.ts`. Screenshots were reviewed from `/tmp/campushomes-adaptive-ui` during implementation.

## Other checks

- Frontend Jest: 106 suites / 621 tests passed.
- Subsequent focused shell, dialog, tenant import and emergency-contact checks: 10 suites / 40 tests passed.
- Web TypeScript and ESLint passed.
- `git diff --check` passed.
- Production build and remote CI are release gates; their final results are recorded in the pull request and GitHub Actions rather than inferred from source inspection.

## Release verification and limits

Main pushes automatically deploy staging. Production requires a separate manual workflow dispatch. Before this release, production web/API reported `62c035c556e612686eb52ca8b5c57287bb34dd86`, while staging was newer. A merge alone must not be reported as a production deployment.

Release acceptance requires successful security/CI checks, staging and production `/version` matching the final main commit, healthy API/database/Redis/schema checks, and an actual production light/dark browser inspection. Do not claim these checks passed solely from this note.

This matrix verifies browser engines and CSS viewport/text behavior. It does not certify every physical HP/Apple device, legacy browser, native Windows file picker, hosted identity-provider path or real-user dataset. Data tables and horizontal tab strips retain their deliberate internal scroll behavior; the page itself must remain within the viewport.
