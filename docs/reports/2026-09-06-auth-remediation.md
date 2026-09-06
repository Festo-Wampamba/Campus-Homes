# CampusHomes authentication remediation report

Date: 2026-09-06  
Repository baseline: `1f0a58569ea339fef61a56f246868aed7c9f1e7d`  
Implementation state: local working-tree patch; not deployed by this work  
Assessment confidence: high for repository behavior covered by tests; unverified for live Dokploy and Logto configuration

## Executive outcome

The repository now treats Logto as the identity and authentication-assurance provider and CampusHomes role assignments as the authorization authority. A user can retain multiple workspaces, landlord enrollment adds access instead of replacing student access, staff access is invitation-only, and privileged authorization requires provider-derived MFA assurance.

The code and local disposable-database test gates pass. Production release is still blocked until the actual Dokploy/Logto configuration, backup restoration, MFA claims, real integrations, and authenticated staging workflows are verified. No claim in this report means that the live deployment has already been changed.

## Implemented changes

### Identity provisioning

- Serializes callbacks by Logto subject and contact identifiers with transaction-scoped advisory locks.
- Links a legacy CampusHomes account only when the contact is provider-verified, the match is unambiguous, and the conditional update still finds an unlinked record.
- Rejects conflicting or ambiguous contact ownership instead of silently linking accounts.
- Creates a first consumer role assignment as `student/own`; authorization no longer depends on that compatibility value alone.
- Accepts matching staff invitations atomically with identity provisioning and role assignment.
- Resolves staff eligibility from active, unrevoked, in-window role assignments.
- Preserves pending-account routing and rejects suspended or deleted accounts.

### Roles, permissions, and scope isolation

- Routes staff grants, revocations, and deactivation through one role-assignment service.
- Stops staff access changes from overwriting `users.role`; that column remains compatibility data during migration.
- Deactivating staff access revokes staff assignments without suspending unrelated student or landlord access.
- Preserves permission-to-scope provenance and passes only the matching permission's scopes to scope-aware mutations.
- Narrow grants fail closed on legacy staff endpoints that have not yet implemented target-specific scoping.
- Synchronizes Ops directory records from active Ops role assignments.
- Preserves role history and evaluates active validity windows on every session lookup.

### Staff invitation lifecycle

- Direct admin creation of staff accounts and local temporary passwords is rejected.
- Staff invitations are audited, expiring records with delivery attempt, success/failure, retry, cancellation, and acceptance state.
- Existing verified identities receive the approved role without duplicate account creation.
- The admin staff screen displays invitation state and exposes guarded retry/cancel actions.

### Landlord enrollment

- The former unauthenticated password-registration endpoint now returns HTTP 410 and does not create credentials or local accounts.
- The public landlord call to action enters hosted Logto sign-in and then an authenticated enrollment page.
- Enrollment idempotently adds `landlord/own` to the current active account and keeps all unrelated roles.
- Property onboarding, KYC review, verification, and publication controls remain separate from account enrollment.

### OIDC transactions, sessions, MFA, and logout

- Uses encrypted, single-use, ten-minute OIDC transaction records in Redis, bound to browser correlation, state, nonce, PKCE storage, portal, destination, and expected identity when stepping up.
- Supports concurrent browser sign-ins without shared portal or destination cookies.
- Normalizes and authorizes same-origin destinations before navigation.
- Derives authentication freshness and MFA only from validated Logto `auth_time` and `amr` claims.
- Privileged authorization fails closed unless `LOGTO_MFA_POLICY_VERIFIED=true` and the provider supplied the required evidence.
- Removes a production CommonJS/ESM incompatibility by making the Logto `Prompt` import type-only.
- Application logout revokes the CampusHomes session and then navigates through Logto's end-session URL so a subsequent sign-in does not silently reuse the prior identity.
- Clears current and known legacy cookie variants, including an explicitly configured legacy domain.
- Cookie-authenticated mutations remain protected by the exact web-origin guard; sibling subdomains are not trusted merely because they are same-site.

### Operations and diagnostics

- Returns distinct sign-in errors for expired transactions, dependency unavailability, account mismatch, identity conflict, missing MFA, and incomplete provider logout.
- Uses redacted request correlation IDs and avoids logging credentials, codes, tokens, or cookie values.
- Removes nested transaction ownership from the affected admin-user service; `RlsDb` is the transaction owner.
- Updates `apps/api/.env.example` to document the Logto clients, M2M credentials, transaction secret, connector secrets, MFA release gate, and host-only-cookie default.

## Finding disposition

| Finding | Priority | Status | Evidence/change | Confidence and remaining limitation |
|---|---:|---|---|---|
| A1: split role authority | High | Remediated in code | One assignment service; access resolver uses active assignments; staff deactivation preserves the account | High. `users.role` still exists for compatibility and requires a later removal migration. |
| A2: permission/scope relationship lost | High | Remediated for supported mutations | Permission grants retain scope; matching scopes are injected into role/staff mutations | High for covered mutations. Other legacy service-role staff endpoints reject narrow grants until each is made scope-aware. |
| A3: unverified contact linking | High | Remediated in code | Provider verification flags, ambiguity checks, conditional linking, and conflict outcomes | High in tests. Live safety also depends on correct Logto connector verification settings. |
| A4: application-session freshness used as MFA | High | Remediated in code | Signed provider `auth_time`/`amr`; explicit MFA policy release gate; 30-minute sensitive-action freshness | High in unit tests. Actual Logto claim behavior is a release blocker. |
| A5: student default conflicts with landlord onboarding | Medium | Remediated in code | Authenticated landlord enrollment adds a second role | High in unit tests. Live email/phone sign-up remains to be exercised. |
| A6: cross-system partial account creation | Medium | Remediated for affected flows | Identity first for landlords; durable invitation state for staff; atomic local acceptance | High locally. External email retries still require an operational worker/provider check. |
| A7: shared login cookies | Medium | Remediated in baseline and retained | Per-state host-only correlation cookie and Redis transaction | High in unit tests; multi-tab browser acceptance remains outstanding. |
| A8: unsafe or unauthorized destination | Medium | Remediated in baseline and retained | Normalization, encoded-delimiter rejection, workspace authorization, chooser fallback | High in routing tests. Reverse-proxy normalization must be confirmed in staging. |
| A9: incomplete logout | Medium | Remediated in code | Local revocation plus provider end-session navigation and legacy cookie cleanup | High in unit tests; provider post-logout URI remains a configuration check. |
| A10: outages presented as ordinary auth failures | Medium | Substantially remediated | Distinct unavailable outcomes and correlation IDs | Medium-high. Live Redis/API failure screens remain to be exercised. |
| A11: unsafe uniqueness recovery | Medium | Remediated in code | Advisory locking, preflight conflict checks, atomic conditional linking, no query in an aborted transaction | High in disposable PostgreSQL concurrency tests. |
| A12: stale generated/test output | Low | Remediated for this verification | Explicit package builds, type checks, controlled Jest invocation, and clean production build | High for this checkout. CI should enforce the same commands. |

## Verification evidence

All database-changing tests below used the explicitly disposable local database `campushomes_test` on localhost port `54329`. No staging or production records were changed.

| Gate | Result |
|---|---|
| Complete API Jest suite | 34 suites passed; 353 tests passed |
| Complete web Jest suite | 10 suites passed; 52 tests passed |
| Focused auth suite | 9 suites passed; 60 tests passed |
| Focused PostgreSQL provisioning/RLS suite | 3 suites passed; 134 tests passed |
| API TypeScript | Passed (`tsc --noEmit`) |
| Web TypeScript | Passed (`tsc --noEmit`) |
| API ESLint | Passed |
| Web ESLint | Passed |
| API production build | Passed; emitted controller contains no static `@logto/node` CommonJS import |
| Web production build | Passed; 62 routes compiled/type-checked/generated |
| Patch whitespace check | Passed (`git diff --check`) |

Covered regression cases include verified and unverified linking, ambiguous contacts, targeted and untargeted dual-contact invitations, invitation acceptance, duplicate callbacks, callback races, suspended/pending accounts, landlord enrollment idempotency, multi-role preservation, role-scope enforcement, property/catchment RLS, missing MFA, logout response handling, and authorized workspace routing.

## Environment and migration status

- Migration `0036_auth_invitations` is present in the repository migration journal and was applied successfully only to the disposable local database.
- Actual staging/production migration state was not read.
- Actual deployed web/API commit hashes, Logto image digest/version, Redis eviction policy, callbacks, post-logout URIs, connector verification settings, organization MFA policy, and Dokploy environment variables were not available to this run.
- No backup was created and no restoration drill was performed because no live deployment operation was authorized or attempted.
- No temporary mailbox or live application account was created. Test-account inventory and cleanup status: none.

## Release blockers and staging acceptance

Do not promote this patch for real users until all of the following have evidence attached to the release:

1. Record the deployed web/API commits, migration state, Logto image digest/version, and redacted Dokploy environment-variable names.
2. Take a recoverable database backup and complete a restoration drill into an isolated database.
3. Confirm Redis persistence and a no-eviction policy appropriate for OIDC transactions.
4. Register the exact callback and post-logout URLs for both Logto applications.
5. Confirm that Logto marks email/phone contacts verified only after the configured connector actually verifies ownership.
6. Configure the internal staff organization MFA policy, test TOTP and recovery codes with controlled accounts, verify signed `auth_time` and `amr` claims, and only then set `LOGTO_MFA_POLICY_VERIFIED=true`.
7. Keep staff/ops workspaces disabled if the deployed Logto version cannot provide the required MFA evidence. Do not weaken the gate.
8. Replace all payment/SMS/email stub integrations needed for launch. The complete API test run correctly warned that `FLUTTERWAVE_SECRET_KEY` was absent while `ALLOW_STUB_INTEGRATIONS=true`; that posture is not suitable for real users.
9. Deploy API and web as a compatible pair, run migrations once, and execute the full synthetic-account matrix across reload, hard refresh, restart, two tabs, expiry, logout, and account switching.
10. Create only unprivileged disposable student/landlord staging accounts. Use controlled inboxes for staff, Ops, mixed-role, MFA, and recovery tests. Never grant privileged access to a public temporary inbox.
11. Rotate the test password exposed in the supplied screenshot and revoke that account's sessions before any reuse.
12. Verify Logto/email invitation delivery and retry behavior, then record and remove every synthetic account and session.

## Rollout and rollback

Recommended order: backup and baseline; migration dry run; API deployment; health and session-contract check; web deployment; synthetic acceptance; controlled privileged acceptance; release-gate review.

The migrations are forward-only and must not be blindly reversed. A compatible application build may be restored without deleting role or invitation history. If rollback would restore the prior unsafe authorization behavior, disable staff/ops entry points and mutations while repairing forward instead of re-enabling that behavior.

## Remaining risks

- The live infrastructure and identity-provider configuration are still unverified.
- Narrowly scoped roles intentionally cannot use legacy unrestricted admin endpoints. Those endpoints need individual target-scope designs before narrow grants are enabled there.
- `users.role` is still consumed as compatibility/profile data in older areas. New authorization paths use assignments, but deleting the column requires a separate audited migration after all consumers are removed.
- Email delivery durability records attempts and supports retry, but a dedicated queue/outbox worker would provide stronger unattended delivery guarantees at larger scale.
- Monitoring, alerts, recovery runbooks, and periodic access reviews are required for durable security even after staging acceptance passes.

## Completion decision

Repository implementation and local verification: **pass**.  
Ready for unaudited production deployment: **no**.  
Ready for controlled staging rollout after backup/configuration checks: **yes**.
