# Security operations

Report suspected vulnerabilities privately to the repository owner. Never put
credentials, session tokens, personal records, or exploit payloads in public issues.

## Deployment requirements

- Run the production containers, not `next dev` or Nest watch mode. Their runtime
  sets `NODE_ENV=production`, runs as a non-root user, and does not expose an inspector.
- Keep real credentials in the deployment secret store. `.env` files must remain
  untracked and owner-readable only (`chmod 600`). `NEXT_PUBLIC_*` is browser-public:
  only public identifiers belong there, never database URLs, private API keys or tokens.
- Use HTTPS for `WEB_ORIGIN`, `AUTH_APP_URL` and the browser-facing `LOGTO_ENDPOINT`.
  `WEB_ORIGIN` is one exact origin; do not use wildcards or a comma-separated list.
- Configure `TRUSTED_PROXY_CIDRS` to the **actual** trusted Next/ingress/CDN proxy
  addresses/subnets. The API uses Express `req.ip`, not client-supplied cookies or
  `CF-Connecting-IP`/`X-Real-IP`. Every trusted edge must overwrite/sanitize forwarding
  headers. Restrict direct origin access. Never set trust to all addresses or use an
  unverified hop count. Empty config is spoof-resistant but visitors sharing a proxy
  share a quota; verify two distinct visitors before rollout.
- Redis is required in production. API writes and sign-in starts return 503 when
  their rate-limit store is unavailable. Alert on sustained 429/503 rates. Add an
  edge/WAF quota for reads, distributed abuse and denial-of-service volume.
- The nonce Content Security Policy requires request-time HTML. Do not configure
  a CDN to cache HTML across visitors. Test login, theme, map workers, chat and
  uploads in staging after changing origins or CSP. Inline styles remain allowed;
  inline scripts require the request nonce.
- Keep B2 uploads on a separate storage origin. The MIME allowlist is signed;
  it is not malware scanning or proof of actual file contents. Cloudinary binds
  `allowed_formats`. Configure provider-side file-size/storage quotas and scanning
  before accepting untrusted documents at scale; the 15 MB UI cap is not a server cap.

## Identity and database

- Logto owns password storage and hashing. Do not add plaintext password columns
  or replace it with home-grown hashing. Verify the deployed provider version,
  password policy, login throttling and recovery settings in its admin console.
- Staff require a staff-client flow, fresh provider authentication and enrolled
  MFA. `LOGTO_MFA_POLICY_VERIFIED` is an operator assertion of deployed provider
  enforcement when signed MFA claims are absent, not an automatic security test.
  Acceptance-test MFA refusal/bypass cases before setting it true.
- Runtime database credentials must be restricted, not owner/superuser/BYPASSRLS.
  Use verified TLS for remote DB/Redis connections. Isolate migration-owner access
  from ordinary runtime operations and restrict network access to both services.
- Row-level security, server guards and scoped role grants are complementary.
  Never rely on hidden UI links for authorization. Run RLS and cross-account tests
  when changing roles, ownership, queries or migrations.
- Rotate any exposed credential at its issuer first, revoke affected sessions,
  then clean history if necessary. Deleting a key from Git does not revoke it.
  A clean secret scan does not prove credentials were never exposed elsewhere.

## Verification

Use the disposable test database, never a production/development database for
tests that truncate data. Local compose ports bind only to loopback.

```sh
pnpm install --frozen-lockfile
pnpm --filter @campushomes/shared build
pnpm audit --prod --audit-level=high
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @campushomes/api build
pnpm --filter @campushomes/web build
```

Keep dependency updates and secret scanning in CI. Treat remaining advisory,
provider-configuration and untested live-flow gaps explicitly; no audit proves
that an application can never be compromised.
