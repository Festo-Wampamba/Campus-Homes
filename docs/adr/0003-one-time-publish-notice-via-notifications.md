# ADR-0003: One-time "property published" notice uses the notifications table

**Date**: 2026-10-11
**Status**: accepted
**Deciders**: Festo Wampamba, Claude

## Context

After Ops publishes a landlord's first listing for a property, the landlord dashboard kept a
permanent banner. The landlord should see a thank-you message once, it should be gone on the next
visit or refresh, and they should also get an email. The landlord may sign in from several devices.

## Decision

`OpsService.publishListing()` (first publish only) writes an in-app `listing.published`
notification and sends a Resend email, both best-effort after the publish commits. The dashboard's
`PublishedNotice` shows unread `listing.published` notifications and marks them read as soon as
they display. With a live listing the steady KYC banner renders nothing else.

## Alternatives Considered

### Alternative 1: Dismissal flag in localStorage
- **Pros**: no API calls
- **Cons**: per browser; reappears on every other device and after clearing storage
- **Why not**: "seen once" must hold across devices

### Alternative 2: A `landlords.publish_notice_seen_at` column
- **Pros**: explicit
- **Cons**: needs a migration, and one flag can't cover several properties published at different times
- **Why not**: the notifications table already stores per-event read state and feeds the bell

## Consequences

### Positive
- Shown once per published property, consistent across devices; also visible in the bell
- No schema change

### Negative
- A landlord whose listing went live before this release never gets the notice (none was recorded)

### Risks
- Mark-read fires on display, so a notice shown in a tab the landlord never looked at counts as seen
