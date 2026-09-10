# Auth acceptance and staff bootstrap

This is the release gate for CampusHomes authentication and authorization. A checked code test is not a substitute for a delivered email, a delivered WhatsApp message, or an authenticated request against the deployed API.

## Ownership model

- Use one Logto tenant with two applications: Consumer and Staff.
- Keep one Logto identity and one CampusHomes `users` row per person. A person may have several independent workspace grants.
- Logto owns identity proof, email/phone verification, Google sign-in, sessions, and TOTP.
- CampusHomes owns roles, permissions, scopes, onboarding state, dashboard routing, and Postgres RLS.
- Do not create a Logto organization per role. Catchment and property access are CampusHomes assignment scopes, not identity tenants.

## Bootstrap the first Super Admin

The legacy `admin:reset` command creates a Better Auth credential and must not be used for a deployed Logto environment.

1. Choose a named, individual company email. Do not use a shared mailbox.
2. Sign in once through the normal CampusHomes consumer flow with that email and complete email verification. This creates and links the local CampusHomes user to its Logto subject.
3. In the API container, set `SUPER_ADMIN_EMAIL` to that exact email and temporarily set `ALLOW_SUPER_ADMIN_BOOTSTRAP=true`.
   If this first administrator must also operate the Operations workspace, set
   `SUPER_ADMIN_OPS_ROLE=ops_lead` (or `ops_inspector`) and explicitly set
   `SUPER_ADMIN_OPS_SCOPE_TYPE=platform_wide`, or use `catchment` together with
   `SUPER_ADMIN_OPS_SCOPE_ID=MUK|MUBS|KIU|KYU|all`.
4. Run `pnpm --filter @campushomes/api admin:bootstrap`.
5. Remove `ALLOW_SUPER_ADMIN_BOOTSTRAP` immediately.
6. Sign out of both CampusHomes and Logto, then use the Staff sign-in entry point and enroll TOTP.
7. Confirm `/api/v1/admin/access/me` reports `super_admin`, a `platform_wide` assignment, and `mfaVerified=true` before changing any other staff access.

The bootstrap is idempotent, requires an active email-verified Logto-linked user, records an audit event, and refuses to create a third active Super Admin.

`super_admin` grants only the Administration workspace. It does not implicitly include Operations — this is deliberate (least privilege, matches the acceptance matrix below). Ordinary API and console role assignment blocks self-grants. For the first Super Admin, use the guarded optional Operations settings above. After a second authorized administrator exists, that administrator may grant or change the first administrator's Operations access through `/admin/users`. "Choose workspace" showing only Administration is not a bug; it reports that account's actual grants.

## Invite and assign staff

Use `/admin/access/staff` to invite staff and inspect invitation delivery. Use its **Manage access** action (which opens `/admin/users`) to grant, revoke, or scope roles for an existing person. Do not create staff directly in Logto and do not edit `users.role` manually.

## Apply hosted sign-in branding

The branding command reads the current Logto Sign-in Experience first and is a dry run unless `--apply` is present. Keep staging and production credentials in their separate deployment environments; never copy M2M secrets into the command line or Git.

```text
BRANDING_TARGET=staging pnpm --filter @campushomes/api auth:brand-signin
BRANDING_TARGET=staging pnpm --filter @campushomes/api auth:brand-signin -- --apply
```

Review the dry-run output and browser preview before the staging apply. For production, repeat the dry run, obtain the release confirmation, then use both the apply flag and the production latch:

```text
BRANDING_TARGET=production ALLOW_PRODUCTION_SIGNIN_BRANDING=true \
  pnpm --filter @campushomes/api auth:brand-signin -- --apply
```

The script validates that the target label matches the Logto and web hostnames. It applies the CampusHomes logo, teal primary colors, coral focus treatment, and Poppins typography. Remove `ALLOW_PRODUCTION_SIGNIN_BRANDING` immediately after the apply.

| Persona | Role | Normal scope | First landing | Must not inherit |
| --- | --- | --- | --- | --- |
| Owner / emergency administrator | `super_admin` | `platform_wide` | `/admin` | none; keep to one or two people |
| Day-to-day administrator | `platform_admin` | `platform_wide` | `/admin` | Super Admin management |
| Operations manager | `ops_lead` | relevant catchment, or platform-wide only when truly needed | `/ops` | finance and staff administration |
| Field inspector | `ops_inspector` | assigned catchment | `/ops` | publishing, finance, staff administration |
| Finance operator | `finance_admin` | `platform_wide` | `/admin/finance` | Ops, support mutation, role management |
| Support operator | `support_admin` | relevant catchment or platform-wide support desk | `/admin/inquiries` | Ops publishing, finance mutation, role management |
| Compliance reviewer | `auditor` | `platform_wide` | `/admin/audit-log` | every mutation route |

For each invitation:

1. Enter the verified work email, role, smallest useful scope, reason, and optional expiry.
2. Confirm the invitation row says delivery `sent` and has no delivery error.
3. Open the email in a clean browser profile. The link must contain a one-time Logto token and must fail if reused.
4. Complete Logto sign-in and TOTP enrollment/verification.
5. Confirm the expected first landing from the table.
6. Confirm at least one allowed API call and every denial listed for that persona in the acceptance matrix.

## Email acceptance

Use distinct controlled inboxes for a new consumer and a new staff member. Preserve message IDs/timestamps, but never store OTP codes or invitation tokens in the report.

1. New consumer email OTP registration arrives and completes registration.
2. Existing consumer email OTP sign-in arrives and reaches the correct workspace.
3. Forgot-password email arrives, the reset completes, and the old password no longer works.
4. Staff invitation email arrives, its one-time token works once, TOTP is required, and the correct dashboard opens.
5. Resend/Logto request logs show a successful provider acceptance for each delivery.

Mailbox creation alone is not delivery evidence. Before running these checks, confirm SPF and DKIM pass and publish a DMARC policy chosen by the domain owner. Start with monitored enforcement only when the aggregate-report destination is an existing, controlled mailbox; do not invent a reporting address.

## WhatsApp OTP activation

Phone authentication remains disabled until all of these are ready in the target environment:

- a production WhatsApp Business sender and phone-number ID;
- a permanent system-user access token with messaging permission;
- an approved Authentication template with a copy-code button;
- a dedicated `LOGTO_SMS_WEBHOOK_SECRET` shared only by Logto and the API;
- Redis available with the no-eviction policy used by the OTP quota.

Set these API variables through the deployment secret store, never in Git:

```text
PHONE_OTP_CHANNEL=whatsapp
WHATSAPP_GRAPH_API_VERSION=<currently supported pinned version>
WHATSAPP_PHONE_NUMBER_ID=<sender phone-number id>
WHATSAPP_ACCESS_TOKEN=<permanent system-user token>
WHATSAPP_AUTH_TEMPLATE_NAME=<approved authentication template>
WHATSAPP_TEMPLATE_LANGUAGE=en
LOGTO_SMS_WEBHOOK_SECRET=<independent random secret>
```

In Logto, configure the single HTTP SMS connector to POST to:

```text
https://campushomes.co.ug/api/auth/logto/sms-webhook
```

Add `Authorization: Bearer <LOGTO_SMS_WEBHOOK_SECRET>`. Test the `Generic` template to a real WhatsApp-enabled Ugandan `+256` number before enabling phone number registration or sign-in. Then prove Register, SignIn, and ForgotPassword. The CampusHomes webhook accepts only Ugandan E.164 numbers and fails closed; there is no authentication SMS fallback.

Africa's Talking is still used by four non-auth product alerts. Removing that separate integration requires approved WhatsApp Utility templates and explicit WhatsApp notification consent for those recipients. Do not send arbitrary free-form utility text or silently treat a stored phone number as WhatsApp consent.

## Controlled account matrix

Create synthetic accounts that are unique to staging, record their Logto subject and CampusHomes user ID, and delete/revoke them after the run.

| Account | Expected workspaces | Expected initial destination | Direct denials to record |
| --- | --- | --- | --- |
| student only | Student | `/` | landlord create, Ops queue, admin overview |
| landlord only, KYC pending | Landlord | `/landlord` after property submission | student profile mutation, Ops queue, admin overview |
| student + landlord | Student + Landlord | `/choose-workspace` | Ops queue, admin overview |
| super admin | Admin | `/admin` | consumer mutations unless separately granted |
| platform admin | Admin | `/admin` | Super Admin grant/revoke |
| Ops lead | Ops | `/ops` | finance mutation, staff role management |
| Ops inspector | Ops | `/ops` | visit approval/publish, finance, staff role management |
| finance admin | Admin | `/admin/finance` | `/api/v1/ops/queue`, staff role management, support mutation |
| support admin | Admin | `/admin/inquiries` | `/api/v1/ops/queue`, finance mutation, staff role management |
| auditor | Admin | `/admin/audit-log` | every POST/PATCH/DELETE route, including `/api/v1/ops/queue` access where not explicitly granted |

For every request capture: UTC timestamp, account label, HTTP method/path, expected status, actual status, deployed commit, and a redacted response excerpt. Use the real session cookie from that synthetic account; never copy cookies or tokens into the report. A UI-hidden link is not a denial test—the API response must be `401` or `403`.

## Release order

1. Rotate any OIDC client secret that has been copied into a ticket, chat, screenshot, or session note; update the deployment secret store and verify the old secret no longer works.
2. Deploy and verify staging commit/version.
3. Run email registration, sign-in, forgot-password, and staff invitation/TOTP.
4. Run the complete account and direct-API denial matrix.
5. Activate WhatsApp in staging and prove a real `+256` delivery for every OTP use type.
6. Repeat the controlled production smoke tests with dedicated production test identities.
7. Remove synthetic identities, revoke their assignments/sessions, remove the bootstrap latch, and attach the redacted evidence report to the release.

If any staff role reaches an unexpected dashboard or a denied API returns `2xx`, disable staff access for that deployment and investigate before continuing.
