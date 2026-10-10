# ADR-0001: Store rent collection periods as a multi-select array

**Date**: 2026-10-11
**Status**: accepted
**Deciders**: Festo Wampamba, Claude

## Context

Landlords often accept more than one rent schedule (per semester and monthly, sometimes a custom
arrangement). `properties.rent_period` held a single value from `monthly | per_semester | other`,
so the onboarding, edit and admin forms could only capture one. Production deploys roll the API
container: the old image keeps serving for up to a minute while the new one migrates and boots.

## Decision

Add `properties.rent_periods text[] NOT NULL DEFAULT '{}'` (migration 0059), backfilled from
`rent_period`, with a CHECK that every element is a known period. The app reads and writes only
`rent_periods`; `rent_period_other` still describes the "other" option. The legacy `rent_period`
column stays in the database, unused, until a later migration drops it.

## Alternatives Considered

### Alternative 1: Change `rent_period`'s type to `text[]` in place
- **Pros**: one column, no leftover
- **Cons**: the old container would read an array where it expects a string and fail Zod parsing
- **Why not**: breaks property reads during every rolling deploy

### Alternative 2: Child table `property_rent_periods`
- **Pros**: fully normalised
- **Cons**: a join plus RLS policies and tests for a three-value list
- **Why not**: no query needs to filter by period yet; an array covers it

## Consequences

### Positive
- Landlords tick every schedule they accept; the "other" description still works
- Rolling deploys stay safe because nothing the old image reads changes

### Negative
- A dead `rent_period` column remains until a follow-up migration removes it

### Risks
- Someone runs `drizzle-kit generate` and it emits `DROP COLUMN rent_period` unexpectedly. That
  is the intended follow-up, but review the generated SQL as already required (snapshot gap).
