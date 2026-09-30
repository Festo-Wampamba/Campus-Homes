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
- `TRUSTED_PROXY_CIDRS` is **required in production**; the API refuses to boot
  without it. Entries are IPs, CIDRs or the Express presets `loopback`,
  `linklocal`, `uniquelocal`; `0.0.0.0/0`, `::/0`, `*`, `true` and any `/0`
  prefix are rejected at boot. Without it every visitor shares the proxy's
  `req.ip` and one rate-limit bucket, so a single client could lock everyone out.
  - Set it to the Docker overlay subnet(s) the web container and Traefik connect
    from. Read them on the VPS with
    `docker network inspect dokploy-network --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'`.
    Use `uniquelocal` if the API is only reachable over private networks.
  - For Cloudflare-proxied hosts, Traefik must trust Cloudflare's published IP
    ranges via the entryPoints `forwardedHeaders.trustedIPs`. Otherwise `req.ip`
    becomes a Cloudflare edge IP.
  - The API uses Express `req.ip`, not client-supplied cookies or
    `CF-Connecting-IP`/`X-Real-IP`. Every trusted edge must overwrite/sanitize
    forwarding headers. Restrict direct origin access.
  - Verify before rollout: two clients on different networks must appear as two
    distinct `req.ip` values in the logs.
- Redis is required in production. API writes return 503 when their rate-limit
  store is unavailable; sign-in starts fail open (logged at most once a minute) so
  a Redis outage cannot lock users out of authentication. Alert on sustained 429/503 rates. Add an
  edge/WAF quota for reads, distributed abuse and denial-of-service volume.
- The nonce Content Security Policy requires request-time HTML. Do not configure
  a CDN to cache HTML across visitors. Test login, theme, map workers, chat and
  uploads in staging after changing origins or CSP. Inline styles remain allowed;
  inline scripts require the request nonce.
- Keep B2 uploads on a separate storage origin. The MIME allowlist is signed;
  it is not malware scanning or proof of actual file contents. Cloudinary binds
  `allowed_formats`. Configure provider-side file-size/storage quotas and scanning
  before accepting untrusted documents at scale; the 15 MB UI cap is not a server cap.
- Identity and ownership documents (landlord ID scans, property documents,
  tenant-agreement signatures) upload with `purpose: 'document'` into a separate
  **private** B2 bucket named by `B2_PRIVATE_BUCKET` (same endpoint, region and
  key as the media bucket; the key needs read and write on it). Create it with
  "Files in Bucket are: Private" and a CORS rule allowing `s3_put` from the exact
  web origin with headers `content-type` and `content-length`, e.g.
  `uvx b2 bucket update --cors-rules '[{"corsRuleName":"doc-uploads","allowedOrigins":["https://campushomes.co.ug"],"allowedOperations":["s3_put"],"allowedHeaders":["content-type","content-length"],"exposeHeaders":["ETag"],"maxAgeSeconds":3600}]' <private-bucket>`.
  No GET rule is needed: reads are presigned navigations issued by
  `GET /api/v1/uploads/document-url` after an ownership/permission check, valid
  300 seconds. A production API without `B2_PRIVATE_BUCKET` answers document
  uploads with 503 by design rather than putting personal data on the public
  bucket. Documents uploaded before this change stay public until migrated.

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
