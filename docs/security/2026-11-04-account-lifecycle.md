# Account lifecycle investigation — staging, 4 November 2026

## Findings

- The requested `festo` profile username belongs to an active admin account. It was not held by a soft-deleted account. Staging contained two live user rows and zero soft-deleted rows at inspection.
- Profile usernames were case-insensitively unique in PostgreSQL and copied opportunistically to Logto's separate unique sign-in username. No CampusHomes authorization or account linking uses profile usernames.
- CampusHomes deletes the live user and cascades its operational footprint. Session rows and role assignments are removed. Financial/audit history is deliberately retained with account foreign keys detached; existing free-text metadata is not a guarantee of full anonymization.
- Logto deletion previously ran without awaiting completion. Provider failures were only logged, while the UI still claimed permanent deletion. This could leave a usable provider identity behind; consumer provisioning could recreate an app account for that subject.
- The server enforces inactivity expiry. Onboarding lacked the signed-in shell's activity/warning/expiry handling, producing a bare Unauthorized error after a long pause.
- Staging had three Logto identities for two app users. The unlinked identity originated in the staff application on 2 November and had no staff-organization membership at inspection. That is insufficient evidence to attribute it to a deletion. It was not removed or automatically quarantined.

## Changes

- Migration 0085 removes profile username uniqueness. Format/length validation remains. Verified sign-in contacts and internal IDs remain account identifiers. Profile usernames now sync to non-unique `customData.profileUsername`, without changing Logto sign-in usernames.
- Deletion atomically records a service-only hashed provider-subject tombstone and durable cleanup request before removing the live account. Provisioning takes the same subject lock and refuses tombstoned subjects, including after successful provider cleanup.
- The API awaits provider deletion with bounded network timeouts. A failure returns `identityCleanupPending`; startup and periodic retries rotate pending requests. A successful cleanup drops the raw subject and retains its hash to block stale callbacks. Deleting an already absent provider identity is successful.
- Outstanding invitations for the deleted user's email are removed so a new registration cannot inherit an old pending invitation.
- The admin notice distinguishes live removal from pending provider cleanup and states retained-history/file/backup boundaries.
- Onboarding uses the existing inactivity controller. Expired submissions explain the session ended, disable further submission, and offer sign-in. Account-specific tab-only drafts can be restored or discarded after sign-in. The intended authorized destination survives.

## Validation and limits

Focused tests cover duplicate usernames, identity cleanup failure/retry, revoked app sessions, blocked stale callbacks, a fresh subject receiving a new account ID, cancellation of pending invitations, cleanup-table RLS, and onboarding draft/expiry behavior. Local data tests use a disposable database; browser tests use a local fixture API. No hosted test identities or real-user deletions were performed.

This is account-access deletion, not a certified erasure of every copy of personal data. Uploaded storage objects, backups, provider logs and free-text historical payloads need a separate retention/erasure assessment. The database cascade does not call an object-storage deletion API. Existing private-document reads require an active session and live authorization references; this does not establish that stored objects were physically erased. No broad security audit or production data cleanup is claimed.
