# Security operations

Report suspected vulnerabilities privately to the repository owner. Never put
credentials, session tokens, personal records, or exploit payloads in public issues.

## Before deploying this branch

Staging runs `NODE_ENV=production` too, so every item below applies to it. The CI
deploy re-sends Dokploy's **stored** Environment, so put these in that stored copy
(a `docker service update` alone is reverted by the next deploy) **before** merging
to `main`, because the merge triggers the deploy.

- [ ] `TRUSTED_PROXY_CIDRS` set (boot refuses without it): the Docker overlay
  subnet(s) **plus** Cloudflare's published ranges on Cloudflare-proxied hosts. See
  "Deployment requirements".
- [ ] `WEB_ORIGIN`, `AUTH_APP_URL` and `LOGTO_ENDPOINT` are `https://` (boot refuses
  otherwise). `AUTH_APP_URL` defaults to `http://localhost:3000`, so an environment
  that never set it must set it now.
- [ ] `B2_PRIVATE_BUCKET` set, and that bucket has the CORS rule below (`s3_put`
  from the web origin, headers `content-type` and `content-length`). Without them,
  ID-document and drawn-signature uploads fail with 503 at runtime with no boot
  error; the API logs one startup warning when B2 is configured without
  `B2_PRIVATE_BUCKET`.
- [ ] `REDIS_URL` set: Redis is required in production for rate limiting and upload quotas.
- [ ] Deploy web and API together. Browser tabs still running the previous web
  build get 400 on uploads until reloaded (signing now requires `size`); this is
  expected, users just refresh the page. Inspectors with long-lived offline tabs
  should reload before syncing.

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
  - **For Cloudflare-proxied hosts** (the production web host is one) the value
    must **also** include Cloudflare's published IPv4 and IPv6 ranges, alongside
    the overlay subnet, and Traefik must trust the same ranges via the entryPoints
    `forwardedHeaders.trustedIPs`. Fetch the current lists from
    https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6 and
    keep them in sync when Cloudflare changes them; do not copy a list into this
    repository. With only the overlay trusted, the request arrives as
    `X-Forwarded-For: <client>, <cloudflare-edge>` and `req.ip` becomes the
    Cloudflare edge address, so unrelated users share rate-limit buckets.
  - Entries must be at least a /8 (IPv4) or /7 (IPv6) and may not be IPv4-mapped
    (`::ffff:...`); those are rejected at boot because they would trust
    visitor-supplied forwarding headers.
  - Rate limits are per client IP (IPv6 clients by /64), so campus NAT users share
    a bucket: 300 writes/min, 300 analytics events/min (`/api/v1/events` has its
    own bucket), 30 sign-in starts/min. Uploads are additionally capped at 300
    signatures per user per hour.
  - The API uses Express `req.ip`, not client-supplied cookies or
    `CF-Connecting-IP`/`X-Real-IP`. Every trusted edge must overwrite/sanitize
    forwarding headers. Restrict direct origin access.
  - Verify before rollout: sign in from a phone on mobile data, then confirm that
    session's `sessions.ip_address` equals the phone's public IP (check
    whatismyip) and is not a Cloudflare or Docker address. Two distinct values
    are not enough: distinct Cloudflare edge IPs would also pass.
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
  before accepting untrusted documents at scale. The API enforces the size cap
  (15 MB images, 10 MB PDFs) at signing, and on B2 the signature binds
  `content-length`, so a PUT of any other length is rejected.
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
