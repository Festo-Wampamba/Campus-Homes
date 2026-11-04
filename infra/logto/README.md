# CampusHomes staging authentication image

This patch is staging-only. The base digest pins the exact Logto image inspected on 4 November 2026. It preserves the existing tenant, clients, Google credentials, password policy and staff MFA enforcement.

Changes:

- For the staging consumer client only, the hosted SignIn page's native Create account anchor goes to the CampusHomes `/create-account` chooser. Staff and console clients keep the original register link. The same React component serves desktop and mobile, and its external `href` starts a fresh, correctly scoped OIDC transaction after the user chooses a role.
- Google token and user-info calls get 15 seconds instead of five. Requests that still time out become recoverable connector errors (HTTP 400 through Logto's existing error middleware), with a retry/email alternative. Authorization-code POSTs are not automatically replayed.

Build from the repository root:

```sh
node --test infra/logto/patch-staging.test.mjs
docker build --build-arg CONSUMER_APP_ID=<staging-consumer-client-id> -f infra/logto/Dockerfile.staging -t campushomes/logto-staging:signup-20261104-v2 .
```

Configure **only staging** Logto's persistent Dokploy raw-compose service to use the built image and `pull_policy: never`. Deploy the CampusHomes chooser route before switching authentication images. Keep the previous compose definition securely outside the repository for rollback; it can contain secrets. Redeploy that exact previous image/definition to roll back. The application/API release does not automatically rebuild or deploy this separate authentication service.

The patch fails rather than guessing if the vendor source signatures change. When upgrading Logto, inspect the new connector/SignIn source, update the base digest and patch signatures, rebuild, and verify both mobile and desktop hosted navigation plus a real Google sign-in. Do not apply this Dockerfile to production.

Verification covers the native account-choice links, the connector timeout/error branch, local profile/role selection, contact ownership and published amenities. A signed-in Google flow with a real user remains an acceptance check; unauthenticated provider probes do not establish successful OAuth account creation. No Google credentials, access tokens or personal accounts belong in test fixtures.
