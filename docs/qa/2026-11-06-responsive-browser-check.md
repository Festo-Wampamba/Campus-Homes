# Responsive layout and browser check — 6 November 2026

This change preserves the CampusHomes visual theme and account/permission behavior. It fixes shared layout and control boundaries used by public, landlord, student and staff screens.

## Delivered behavior

- Shared buttons wrap long labels and grow vertically. Inputs and textareas can shrink within their containers, and touch inputs retain a 16px minimum to avoid Safari form zoom.
- Shared dialogs use the available dynamic viewport height. Phone and short-landscape forms scroll as a whole; larger forms retain a scrolling body. Headers, close buttons and wrapped footer actions remain reachable at enlarged text sizes. Resizing stays bounded to the screen. Dialogs receive an accessible name from their visible header.
- Workspace navigation and search use native modal focus handling. Navigation closes when resized to a desktop layout. Sidebar labels wrap, with a bounded sidebar width.
- Account and notification panels become bounded dialogs on compact screens. Mobile sign-out is available in the account panel. Theme toggling still works when browser storage is blocked.
- Public mobile navigation now lays out its links inside the dialog. Public hero, contact, landlord enquiry and journey-preview grids reflow without forcing a wider page. Logos retain their aspect ratio.

## Local browser evidence

Playwright 1.64.1 with Chromium 156, Firefox 157 and WebKit 27.2 on Linux. Device sizes and touch input are emulated; this is not a native Windows/macOS/iOS/Android certification or a claim about every historical browser.

| Check | Cases | Result |
| --- | ---: | --- |
| Shared workspace shell, navigation, notifications, search, long dialog header/footer | 21 | Passed |
| Room photo file chooser/save payload and tenant import/template/review controls | 9 | Passed |
| Public routes, dark theme, navigation scrolling/Escape/desktop resize | 46 | Passed |
| Enlarged-text account and named dialog interactions, dark theme | 3 | Passed |

Shared layout sizes: 320×740, 768×1024, 844×390, 1440×900, 2560×1440, plus 375×812 and 844×390 at 200% root text. Each engine ran all seven cases. Checks covered document/dialog overflow, visible footer actions, dialog opening/closing and navigation resize behavior.

Public Chromium checks covered `/`, `/landlords`, `/contact`, `/how-it-works`, `/sign-in`, `/staff` and `/create-account` at 320, 768 and 1440px, plus 375px at 200% text. Firefox and WebKit also covered home, journey and staff sign-in at phone, landscape and enlarged-text phone sizes. Intentional horizontal scrolling within a journey tab strip or import table is allowed; page-wide overflow is not.

The operational checks rendered the real shared shell and real room/tenant components in a temporary local fixture. API and storage mutations were intercepted. A PNG with an empty browser MIME type passed file selection and was included in the room-type save payload in all three engines. Tenant CSV template download, file selection, extracted-row review and enabled Save control passed. No hosted account, tenant, room or file was created. The fixture is excluded from the release.

The complete frontend suite passed: 105 suites, 607 tests. Frontend lint and the Next.js production build, including its TypeScript check, passed.

Automated component regressions cover compact/desktop panel adaptation, strict-mode mounting, native close propagation, storage-blocked theme changes and dialog naming, alongside the existing tenant, room-type, maintenance and photo-upload tests.

## Limits

This is shared-component and representative-route coverage, not exhaustive testing of every authenticated record or third-party login provider. Physical OS file dialogs and device keyboards require checks on those actual devices. No authentication provider, API business rule, database schema or production configuration changes are included.
