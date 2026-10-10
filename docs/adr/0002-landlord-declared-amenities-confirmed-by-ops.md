# ADR-0002: Landlord-declared amenities pre-fill the publish form; Ops confirms

**Date**: 2026-10-11
**Status**: accepted
**Deciders**: Festo Wampamba, Claude

## Context

Landlords declare four checklists at onboarding: amenities, furnishing, safety and accessibility
(`properties.proposed_amenities`, `furnishing_items`, `security_features`,
`accessibility_features`). The Ops publish form ignored all of them and showed an empty amenities
list, so the lead re-ticked everything from memory and custom items were lost. The public listing
shows only `listing_versions.amenities`, which only Ops can write.

## Decision

On first publish the form pre-ticks everything the landlord declared across all four checklists,
grouped as declared, custom items included. The lead unticks anything the inspection didn't
confirm, and can add undeclared options from a fold-out. The confirmed set, all four categories
merged, is saved to `listing_versions.amenities`. The landlord's declaration on `properties` is
never overwritten.

## Alternatives Considered

### Alternative 1: Copy the landlord's declaration straight onto the listing
- **Pros**: no Ops step
- **Cons**: unverified claims go public
- **Why not**: inspection-verified listings are the product's core promise

### Alternative 2: Ops edits the property's own checklists
- **Pros**: one source of truth
- **Cons**: loses the record of what the landlord claimed versus what was found
- **Why not**: the difference is evidence for strikes and disputes

## Consequences

### Positive
- Ops confirms instead of re-entering; custom landlord items survive
- Furnishing, safety and accessibility now reach the public listing once confirmed

### Negative
- `listing_versions.amenities` mixes four categories under one record (labels come from the key)

### Risks
- A key shared by two lists (`security_guard`) is shown once, so it can't be double-counted
