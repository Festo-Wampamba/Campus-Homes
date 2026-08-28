# CampusHomes — MVP Moderated-Test Readiness

Companion to the MVP build & test-readiness checklist. Everything here reflects
the local docker test DB (`campushomes-local-db-1`, port 54328, db `campushomes_dev`)
and the current `main` build. Keep it updated as accounts/data change.

## 1. Prepared test accounts (local dev DB)

Sign-in is phone-OTP at `/sign-in`. The Africa's Talking **sandbox does not
deliver** to these dummy numbers — read the fresh OTP code from the DB:

```bash
docker exec campushomes-local-db-1 psql -U campushomes -d campushomes_dev \
  -c "SELECT value FROM verifications ORDER BY created_at DESC LIMIT 1;"
```

| Role | Identifier | Notes |
|---|---|---|
| Admin | `festo@campushomes.ug` / password `admin1` | staff email sign-in; super_admin RBAC assignment platform_wide |
| Ops lead | promote via admin console (`/admin/users` → Add user) | role enum `ops_lead`; grant RBAC role on `/admin/access/roles` |
| Landlord | create via admin console → Add user (role landlord) | no self-serve landlord signup by design (role escalation guard) |
| Student | `+256700000001` ("Student One") | active, has profile; reserve-ready |
| Student (fresh) | any new phone-OTP number | lands as `role=student`, `status=pending` |

## 2. Test data posture

- 32 verified listings / 344 units exist locally; deposits backfilled at ~25%
  of term rent (2026-08-23) so student-facing deposit disclosure is real.
- Listings are seeded/hand-made test data — label them clearly if any could be
  mistaken for a real business (rename e.g. "TEST <name>" before external
  moderated sessions).
- No production data is present in this environment.

## 3. Communications gating (no accidental sends)

| Channel | Gate | Current state |
|---|---|---|
| SMS (Africa's Talking) | `AFRICASTALKING_API_KEY` unset → Console adapter | off locally |
| Email (Resend) | `RESEND_API_KEY` unset → `[email:dev]` log line | off locally |
| Inquiry notify email | additionally needs `SUPPORT_NOTIFY_EMAILS` | unset = stored-only |
| Payments | `PAYMENTS_ENABLED` gate + stub adapter outside prod | no real money path in Phase 1 |

## 4. Known gaps for moderated testing (accepted, not bugs)

- No self-serve landlord signup — use a prepared/promoted account (§1).
- Viewing requests are not scheduled anywhere; students enquire via
  `/support` and message landlords through reservation chat threads.
- "Return listing for correction" is not an ops action; recovery from a failed
  inspection is scheduling a re-visit.
- Compare tooling doesn't exist; favourites = shortlist.
