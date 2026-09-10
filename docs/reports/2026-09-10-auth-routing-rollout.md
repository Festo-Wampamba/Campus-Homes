# CampusHomes auth routing and OTP rollout

Date: 2026-09-10

Repository baseline: `4974f8c20db283ffa9786985a0e4e1a60264d1f7`

Logto: self-hosted OSS `1.42.0`, one production tenant

## Outcome

CampusHomes continues to use one identity per person and independently granted workspaces. Authentication is handled by Logto; CampusHomes remains authoritative for roles, scopes, permissions, onboarding, and dashboard access.

The implementation binds `student`, `landlord`, or `staff` intent into each single-use OIDC transaction. A new landlord-intent account receives only `landlord/own`; a new student-intent account receives only `student/own`; staff roles can only be accepted through a verified staff transaction and an unexpired email invitation. Existing accounts retain all legitimate grants.

## Routing and access behavior

- The public sign-in page exposes student housing, property management, and staff entry points.
- A single-workspace account goes directly to its authorized home.
- Multi-workspace accounts use the workspace chooser.
- Super/platform admins land on `/admin`; finance on `/admin/finance`; support on `/admin/inquiries`; auditors on `/admin/audit-log`; Ops roles on `/ops`.
- Admin roles no longer receive an Ops workspace implicitly.
- Staff and admin navigation is permission-aware and privileged workspaces still require provider-derived MFA assurance.
- Legacy `/landlords/enroll` sign-in links infer landlord intent.

## Staff invitations

- Email is mandatory; phone is optional profile data.
- Each delivery requests a fresh Logto one-time token bounded by the invitation and role-validity window.
- The one-time link is bound to the staff portal and staff intent.
- Invitation acceptance requires the same verified email and, when present, the exact pre-bound CampusHomes account.
- A consumer authentication transaction cannot accept or grant a staff invitation.
- Staff still complete Logto TOTP before CampusHomes issues privileged access.

## OTP delivery

- Email verification uses Logto's HTTP Email connector, the authenticated CampusHomes webhook, and Resend.
- Phone verification code delivery is implemented through the Meta WhatsApp Cloud API only. There is no Africa'sTalking fallback for authentication codes; existing non-auth notification channels are unchanged.
- Webhook payloads and bearer secrets are runtime validated.
- WhatsApp requests require a provider acceptance ID, use a ten-second timeout, and never log recipient numbers or codes.
- Redis enforces fixed-window limits of five requests per recipient and, when Logto supplies the client IP, twenty requests per IP per fifteen minutes. Missing IP data never becomes one global reverse-proxy quota.
- `PHONE_OTP_CHANNEL=disabled` is the fail-closed rollback state.

## Production configuration completed

- Corrected the production consumer Logto client ID and paired it with the active secret.
- Rotated the production staff application secret and removed the superseded secret.
- Persisted both changes in Dokploy and confirmed student and staff auth starts use their intended client IDs.
- Corrected the Logto OSS Management API resource indicator to `https://default.logto.app/api`.
- Generated separate connector bearer secrets and persisted them without exposing their values.
- Created the production HTTP Email connector and enabled email registration verification, email OTP/password sign-in, email password recovery, and the existing Google connector.
- Preserved the existing TOTP factor and `PromptAtSignInAndSignUp` policy.
- Changed the web image health probe from the dynamic homepage to `/robots.txt`; the live service was stabilized after the old five-second homepage probe caused a restart loop and HTTP 502 responses.

## Role audit

The read-only production query in `apps/api/scripts/audit-consumer-roles.sql` returned zero active accounts holding both student and landlord grants. No role assignment was changed or revoked.

## Verification evidence

| Gate | Result |
|---|---|
| Shared/API/Web TypeScript | Passed |
| API and Web ESLint | Passed |
| Complete API Jest suite | 41 suites, 399 tests passed |
| Complete Web Jest suite | 10 suites, 61 tests passed |
| PostgreSQL provisioning and RBAC tests | 27 tests passed against disposable port 54329 database |
| API production build | Passed |
| Web production build | Passed; 62 routes generated |
| Patch whitespace check | Passed |
| Production consumer auth start | HTTP redirect with correct client ID |
| Production staff auth start | HTTP redirect with correct client ID |
| Production web and API health | HTTP 200 after health-check stabilization |
| Email webhook unauthorized request | HTTP 401 |

## Remaining external activation

Phone/WhatsApp sign-in remains deliberately disabled in production until all of these Meta-owned values are available: an approved WhatsApp sender, phone-number ID, permanent system-user token with messaging permission, and an approved authentication template with a copy-code button. After those values are installed, set the documented WhatsApp environment variables, deploy the API, create the Logto HTTP SMS connector, enable phone registration/sign-in in Logto, and perform a real-device OTP acceptance test. Do not enable phone sign-in before that test and do not add SMS fallback.

## Rollback

- Disable phone auth immediately with `PHONE_OTP_CHANNEL=disabled`; email and Google remain available.
- Application code may be rolled back without revoking role history or deleting identities.
- Do not restore the superseded staff secret or the misspelled consumer client ID.
- If privileged MFA evidence becomes unreliable, set `LOGTO_MFA_POLICY_VERIFIED=false`; staff access fails closed while consumer access remains available.
