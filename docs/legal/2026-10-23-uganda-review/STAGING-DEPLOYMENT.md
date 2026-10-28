# Privacy and terms staging publication

Date 23 October 2026

## Scope and release

The owner explicitly requested deployment of the reviewed privacy and terms changes to live staging for testing. The earlier research task produced documents only. This follow-up adds the drafts to the existing website routes, with section navigation, responsive light/dark styling and downloads of the exact reviewed Word copies.

- Review URLs are https://staging.campushomes.co.ug/privacy and https://staging.campushomes.co.ug/terms.
- Release pull request is https://github.com/Festo-Wampamba/Campus-Homes/pull/258.
- Feature commit is d73f309 on codex/legal-policy-staging.
- Release base is main at 15e4d671c68cf31e8f8fd8b336e74d0f53b255da, the staging version observed before this change.
- Production baseline observed before deployment is a42b74aaf79a86f93062b59ed12942fbd527a684.
- PR CI passed in run 39919945867, including security, full test suite, API/web builds and both container validations.
- PR 258 merged at 10:57 EAT into main as 854423d0d305b2e664c7d7a089dde9c39d05d970.
- Main CI passed in run 39921286689, including full tests, application builds and both container validations.
- Staging deployment succeeded in the same run, including API and web revision health gates.
- Live staging web and API both report 854423d0d305b2e664c7d7a089dde9c39d05d970.
- Production still reports a42b74aaf79a86f93062b59ed12942fbd527a684, unchanged from the baseline. The production job was skipped.

The isolated checkout is /tmp/campushomes-legal-staging. It was cloned from current remote main; the original local-only redesign snapshot was not pushed. The eight changed paths were also copied into the original workspace for continued local work. Development was behind main when checked, so this scoped release targets current main directly without pulling unrelated feature branches into staging. Production deployment is a separate manual workflow and was not requested.

## Website files

1. apps/web/src/app/(public)/privacy/page.tsx
2. apps/web/src/app/(public)/terms/page.tsx
3. apps/web/src/components/legal-page.tsx
4. apps/web/src/components/legal-page.css
5. apps/web/src/components/legal-page.test.tsx
6. apps/web/src/content/legal-documents.ts
7. apps/web/public/legal/CampusHomes-Privacy-Policy-DRAFT.docx
8. apps/web/public/legal/CampusHomes-Terms-and-Conditions-DRAFT.docx

The structured content preserves all paragraphs and lists from the reviewed Markdown documents. Rendering uses escaped React text and explicitly rendered source links, with no runtime Markdown dependency, runtime filesystem reads or injected HTML. Existing cookies and reservation section anchors remain available. Both routes identify the content as a review draft, have no assigned effective date and set noindex metadata. Website publication for staging does not approve the operational commitments or introduce a consent, payment or data-retention backend.

## Local verification

- Next.js 16.4.1 production build passed on Node 24.
- Web TypeScript check and focused ESLint passed.
- All six legal-page tests passed. A separate content comparison confirmed every reviewed section, paragraph and list was preserved in the website content.
- Eight headless browser scenarios passed: privacy and terms at 390 and 1440 pixels, light and dark. Checked HTTP 200, visible draft status, noindex metadata, no horizontal overflow, contents targets and anchor clearance below the fixed header.
- Both downloads returned HTTP 200 and byte-matched the reviewed Word files.
- Selected desktop/mobile screenshots were visually inspected. Local screenshots and scenario results are under staging-evidence/.
- git diff --check passed before the feature commit.

The sandboxed Jest/Next subprocess path failed to capture TypeScript output and the sandboxed build stalled; these attempts were stopped or failed visibly. The focused tests and production build above were rerun successfully outside the sandbox. The headful browser tool had no display server, so the browser verification used installed headless Chromium instead. Public version requests succeeded using a browser user agent; Python's default user agent had returned HTTP 403.

## Completed live confirmation

Verified the release on the actual staging domains after the successful rollout. Both pages returned HTTP 200 and displayed the reviewed draft versions. All eight mobile/desktop and light/dark browser scenarios passed, including visible draft status, noindex metadata, section targets, header clearance, no horizontal overflow and byte-matching Word downloads. No browser page errors were observed. First-party analytics requests returned HTTP 204 on staging. The local preview had not validated that integration because its build-time proxy pointed at an unavailable local API; the live routing was checked separately.

The API reports status ok, database and Redis up, the release commit, and schema 74 applied with 74 expected. The feature introduced no migrations. Production remained on its original commit. Live results, selected screenshots and release details are saved in staging-evidence/. These checks demonstrate staging publication and the tested page behaviour, not final legal approval or implementation of the proposed backend privacy controls.

## Rollback

Revert only the legal-page release commit through the normal main/staging release workflow, preserving unrelated changes. No database migrations, provider settings, authentication, payment settings or production deployment configuration are changed by this release. Final policy activation still requires the factual and legal decisions in the research package.
